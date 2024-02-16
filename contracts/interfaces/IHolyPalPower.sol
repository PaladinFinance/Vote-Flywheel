// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface IHolyPalPower {
    
    // Structs 

    struct Point {
        int128 bias;
        int128 slope;
        uint256 endTimestamp;
        uint256 blockNumber;
    }

    // Functions
    
	function balanceOf(address user) external view returns(uint256);

    function balanceOfAt(address user, uint256 timestamp) external view returns(uint256);

    function getUserPoint(address user) external view returns(Point memory);

    function getUserPointAt(address user, uint256 timestamp) external view returns(Point memory);

    // to match with veToken interface
    // solhint-disable-next-line
    function locked__end(address user) external view returns(uint256);

    function totalSupply() external view returns(uint256);

    function totalLocked() external view returns(uint256);

    function totalLockedAt(uint256 blockNumber) external view returns(uint256);

    function findTotalLockedAt(uint256 timestamp) external view returns(uint256);

}
