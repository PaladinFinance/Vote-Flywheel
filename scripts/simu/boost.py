import random
from decimal import *
from tabulate import tabulate

getcontext().prec = 2
getcontext().rounding = ROUND_FLOOR


# ----------- Constants -------------



# ------------------------------------
# ------------------------------------
# ------------- Inputs ---------------

nb_users = 10

nb_gauge = 5

min_lock_amount = 100
max_lock_amount = 50000

min_reward_amount = 100
max_reward_amount = 1500

total_loot_distribution = Decimal(1500)

loot_boost_base_multiplier = Decimal(1)
loot_boost_extra_multiplier = Decimal(4)
# so boost goes from x1 to x5


def run(loops = 1):
    total_loot_undistributed = Decimal(0)
    
    total_locked = Decimal(0)
    user_locked = [Decimal(0) for x in range(nb_users)]

    users_in_gauge = [[False for x in range(nb_gauge)] for y in range(nb_users)]
    users_rewards_per_gauge = [[Decimal(0) for x in range(nb_gauge)] for y in range(nb_users)]

    total_per_gauge = [Decimal(0) for x in range(nb_gauge)]

    # is user in gauge
    for i in range(nb_users):
        for j in range(nb_gauge):
            users_in_gauge[i][j] = random.choice([True, False])
    #print(users_in_gauge)
    #print()

    # user locked amounts
    for i in range(nb_users):
            locked = Decimal(format(random.uniform(min_lock_amount, max_lock_amount), '.2f'))
            user_locked[i] = locked
            total_locked += locked

            #print("User " + str(i) + " locked : " + str(locked))
    #print()

    for i in range(nb_users):
        for j in range(nb_gauge):
            if(not users_in_gauge[i][j]):
                continue
            amount = Decimal(format(random.uniform(min_reward_amount, max_reward_amount), '.2f'))
            users_rewards_per_gauge[i][j] = amount
            total_per_gauge[j] += amount
            #print("User " + str(i) + " gauge " + str(j) + " reward : " + str(amount))
    #print()

    total_weight = 0
    gauge_weights = [Decimal(0) for x in range(nb_gauge)]
    for i in range(nb_gauge):
        weight = random.uniform(0.1, 1)
        total_weight += weight
        gauge_weights[i] = weight
    
    for l in range(loops):
        print()
        print("Week " + str(l + 1) + " :")
        print()

        users_loot_per_reward_per_gauge = [[Decimal(0) for x in range(nb_gauge)] for y in range(nb_users)]
        users_multiplier_per_gauge = [[Decimal(0) for x in range(nb_gauge)] for y in range(nb_users)]
        users_loot_per_gauge = [[Decimal(0) for x in range(nb_gauge)] for y in range(nb_users)]

        loot_undistributed_per_gauge = [Decimal(0) for x in range(nb_gauge)]
        loop_total_loot = total_loot_distribution + total_loot_undistributed
        total_loot_undistributed = Decimal(0)
        
        gauge_loot_extra = [Decimal(0) for x in range(nb_gauge)]
        gauge_loot_per_reward = [Decimal(0) for x in range(nb_gauge)]
        
        for i in range(nb_gauge):
            gauge_loot_extra[i] = loop_total_loot * Decimal(gauge_weights[i]) / Decimal(total_weight)
            #print("Gauge " + str(i) + " loot extra : " + format(gauge_loot_extra[i], '.2f'))
        #print()

        for i in range(nb_gauge):
            gauge_loot_per_reward[i] = (gauge_loot_extra[i] / total_per_gauge[i]) / (loot_boost_base_multiplier + loot_boost_extra_multiplier)
            #print("Gauge " + str(i) + " loot per reward : " + str(gauge_loot_per_reward[i]))
        #print()

        for i in range(nb_users):
            for j in range(nb_gauge):
                if(not users_in_gauge[i][j]):
                    continue
                locked_ratio = user_locked[i] / total_locked
                reward_ratio = users_rewards_per_gauge[i][j] / total_per_gauge[j]
                total_ratio = Decimal(0)
                if reward_ratio > 0:
                    total_ratio = locked_ratio / reward_ratio
                user_multiplier = loot_boost_base_multiplier + (total_ratio * loot_boost_extra_multiplier)
                if user_multiplier > loot_boost_base_multiplier + loot_boost_extra_multiplier:
                    user_multiplier = loot_boost_base_multiplier + loot_boost_extra_multiplier
                user_loot_per_reward = gauge_loot_per_reward[j] * user_multiplier
                #print("User " + str(i) + " gauge " + str(j) + " multiplier : " + str(user_multiplier) + " loot per reward : " + str(user_loot_per_reward))

                user_loot_amount = user_loot_per_reward * users_rewards_per_gauge[i][j]

                max_user_loot_amount = (gauge_loot_per_reward[j] * (loot_boost_base_multiplier + loot_boost_extra_multiplier)) * users_rewards_per_gauge[i][j]
                undistributed_amount = max_user_loot_amount - user_loot_amount
                #print("User " + str(i) + " gauge " + str(j) + " loot amount : " + str(user_loot_amount) + " max : " + str(max_user_loot_amount) + " undistributed : " + str(undistributed_amount))

                users_multiplier_per_gauge[i][j] = user_multiplier
                users_loot_per_gauge[i][j] = user_loot_amount
                users_loot_per_reward_per_gauge[i][j] = user_loot_per_reward
                loot_undistributed_per_gauge[j] += undistributed_amount
                total_loot_undistributed += undistributed_amount

        # ------------------------------------
        # ------------------------------------
        # ------------- Display --------------

        print("Total Locked : " + format(total_locked, '.2f'))
        print()

        for j in range(nb_gauge):
            display_data = [[Decimal(0) for x in range(6)] for y in range(nb_users)]
            headers_users = ["User", "Locked", "Base Reward", "Multiplier", "Loot/reward", "Loot"]
            for i in range(nb_users):
                display_data[i][0] = i
                display_data[i][1] = user_locked[i]
                display_data[i][2] = users_rewards_per_gauge[i][j]
                display_data[i][3] = users_multiplier_per_gauge[i][j]
                display_data[i][4] = users_loot_per_reward_per_gauge[i][j]
                display_data[i][5] = users_loot_per_gauge[i][j]

            print("Gauge " + str(j))
            print(tabulate(display_data, headers=headers_users))
            print("Allocated Loot : " + format(gauge_loot_extra[j], '.2f') + " Undistributed : " + format(loot_undistributed_per_gauge[j], '.2f'))
            print("Base loot/reward : " + format(gauge_loot_per_reward[j], '.24') + " Max loot/reward : " + format(gauge_loot_per_reward[j] * (loot_boost_base_multiplier + loot_boost_extra_multiplier), '.4f'))
            print()

        print('----------------------------------------------------------------------')
        print()


if __name__ == '__main__':
    run(1)