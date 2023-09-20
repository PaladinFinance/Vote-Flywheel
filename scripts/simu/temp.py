import random

MAX_CHECKPOINTS = 1000000000

LOOPS = 255

TRIES = 10000

i = MAX_CHECKPOINTS

while i > 0:
    for j in range(TRIES):
        target_checkpoint = random.randint(0, i)

        high = i - 1
        low = 0
        mid = 0

        count = 0

        while low <= high:
            count += 1

            mid = (high & low) + ((high ^ low) >> 1)

            if mid == target_checkpoint:
                break

            if mid < target_checkpoint:
                low = mid + 1
            else:
                high = mid

        print("Max checkpoints : " + str(i) + " - target checkpoint : " + str(target_checkpoint) + " => found checkpoint in " + str(count) + " tries")
    print()
    i = i - int(i * 0.05)

        