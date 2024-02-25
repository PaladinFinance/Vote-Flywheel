// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.20;

interface IHolyPowerDelegation {

    // solhint-disable-next-line
    function adjusted_balance_of(address _account) external view returns(uint256);
    // solhint-disable-next-line
    function adjusted_balance_of_write(address _account) external returns(uint256);
    // solhint-disable-next-line
    function adjusted_balance_of_at(address _account, uint256 _ts) external view returns(uint256);

    // solhint-disable-next-line
    function total_locked() external view returns(uint256);
    // solhint-disable-next-line
    function total_locked_at(uint256 blockNumber) external view returns(uint256);
    // solhint-disable-next-line
    function find_total_locked_at(uint256 timestamp) external view returns(uint256);

}
