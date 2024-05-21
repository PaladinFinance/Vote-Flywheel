//██████╗  █████╗ ██╗      █████╗ ██████╗ ██╗███╗   ██╗
//██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██║████╗  ██║
//██████╔╝███████║██║     ███████║██║  ██║██║██╔██╗ ██║
//██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██║██║╚██╗██║
//██║     ██║  ██║███████╗██║  ██║██████╔╝██║██║ ╚████║
//╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝
 

//SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.20;

import {IQuestBoard} from "../interfaces/IQuestBoard.sol";
import "../libraries/Errors.sol";
import "../utils/Owner.sol";

/** @title Quest Board Proxy contract */
/// @author Paladin
/*
    Proxy contract for calls from the Loot Creator contract to the Quest Board
    to handle cases where mutliple active Boards support the same veToken ecosystem
*/
contract QuestBoardProxy is Owner {

    address public mainBoard;

    address[] public otherBoards;
    mapping(address => bool) public isOtherBoard;

    constructor(address _mainBoard, address[] memory _otherBoards){
        if(_mainBoard == address(0)) revert Errors.AddressZero();
        mainBoard = _mainBoard;
        uint256 length = _otherBoards.length;
        for(uint256 i; i < length; i++){
            _addOtherBoard(_otherBoards[i]);
        }
    }

    /* 
        This method is only called to receive the length of Quests for the period
        (to get the number of Quests for that period on a specific gauge)
        so we can return an empty array of the length reflecting the number of quests 
        on the given gauge for the given period
    */
    function getQuestIdsForPeriodForGauge(address gauge, uint256 period) external view returns(uint256[] memory) {
        uint256 questsCount = IQuestBoard(mainBoard).getQuestIdsForPeriodForGauge(gauge, period).length;
        uint256 boardLength = otherBoards.length;
        for(uint256 i; i < boardLength; i++){
            questsCount += IQuestBoard(otherBoards[i]).getQuestIdsForPeriodForGauge(gauge, period).length;
        }
        uint256[] memory questIds = new uint256[](questsCount);
        return questIds;
    }

	function quests(uint256 id) external view returns(IQuestBoard.Quest memory) {
        return IQuestBoard(mainBoard).quests(id);
    }

    function getAllOtherBoard() external view returns(address[] memory){
        return otherBoards;
    }

    function _addOtherBoard(address newBoard) internal {
        if(newBoard == address(0)) revert Errors.AddressZero();
        if(isOtherBoard[newBoard] || newBoard == mainBoard) revert Errors.AlreadyListed();
        otherBoards.push(newBoard);
        isOtherBoard[newBoard] = true;
    }

    function addOtherBoard(address newBoard) external onlyOwner {
        _addOtherBoard(newBoard);
    }

    function removeOtherBoard(address board) external onlyOwner {
        if(board == address(0)) revert Errors.AddressZero();
        if(!isOtherBoard[board] || board == mainBoard) revert Errors.NotListed();
        isOtherBoard[board] = false;
        uint256 length = otherBoards.length;
        for(uint256 i; i < length; i++){
            if(otherBoards[i] == board){
                otherBoards[i] = otherBoards[length - 1];
                otherBoards.pop();
                break;
            }
        }
    }

}