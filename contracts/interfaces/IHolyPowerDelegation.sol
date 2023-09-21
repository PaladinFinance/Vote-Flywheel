// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface IHolyPowerDelegation {

    struct Point {
        int128 bias;
        int128 slope;
        uint256 endTimestamp;
        uint256 blockNumber;
    }

    struct SlopeChange {
        uint256 slopeChange;
        uint256 endTimestamp;
    }

    // solhint-disable-next-line
    function adjusted_balance_of(address _account) external view returns(uint256);
    // solhint-disable-next-line
    function adjusted_balance_of_at(address _account, uint256 _ts) external view returns(uint256);

    // solhint-disable-next-line
    function total_locked() external view returns(uint256);
    // solhint-disable-next-line
    function total_locked_at(uint256 blockNumber) external view returns(uint256);
    
    // solhint-disable-next-line
    function locked__end(address user) external view returns(uint256);

    function getUserSlopeChanges(address _user) external view returns(SlopeChange[] memory);

    function getUserPoint(address user) external view returns(Point memory);
    function getUserPointAt(address user, uint256 timestamp) external view returns(Point memory);

}
