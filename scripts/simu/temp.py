import random
from decimal import *

getcontext().prec = 18
getcontext().rounding = ROUND_FLOOR

duration = Decimal(random.randint(7890000, 63072000))
amount = Decimal(random.randint(0, 750000))
start = Decimal(1698695207)

WEEK = Decimal(604800)

end = ((start + duration) / WEEK) * WEEK

duration = end - start

slope = amount / duration
bias = slope * duration

for i in range(0, int(duration), int(WEEK)):
    ts = start + Decimal(i)
    balance_1 = slope * (end - ts)
    balance_2 = bias - (slope * (ts - start))
    print(i, " - ", ts, " - ", balance_1, " - ", balance_2, " - ", balance_1 == balance_2)