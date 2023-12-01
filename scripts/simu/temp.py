import random
from decimal import *

getcontext().prec = 18
getcontext().rounding = ROUND_FLOOR

WEEK = Decimal(604800)

bias = Decimal(4750)
start = Decimal(1698695000)

ts = start

point_end = start + (WEEK * Decimal(40))

slope = bias / (WEEK * Decimal(104))
slope_deleg_1 = Decimal(0.00002)
non_deleg_slope = slope - slope_deleg_1
deleg_end = start + (WEEK * Decimal(6))

start_bias = slope * (point_end - start)

other_bias = (slope_deleg_1 * (WEEK * Decimal(34))) + (slope * (WEEK * Decimal(6)))

print('bias start : ', str(start_bias))
print('other bias : ', str(other_bias))

"""while(ts <= (point_end + (WEEK * 5))):
    print('bias start : ', str(start_bias))
    print('slope start : ', str(slope))
    bias_decrease = slope * WEEK
    print('bias decrease : ', str(bias_decrease))
    start_bias = start_bias - bias_decrease
    print('bias end : ', str(start_bias))
    if(ts == deleg_end):
        slope = slope - slope_deleg_1
        print('slope change : ', str(slope_deleg_1))
        print('decreased slope : ', str(slope))
    if(ts == point_end):
        slope = slope - non_deleg_slope
        print('slope change : ', str(non_deleg_slope))
        print('decreased slope : ', str(slope))
    ts = ts + WEEK
    print()"""