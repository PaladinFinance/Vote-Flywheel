from web3 import Web3, HTTPProvider
from dotenv import load_dotenv
import os

load_dotenv()

FORK_URI = os.environ.get("FORK_URI")

w3 = Web3(HTTPProvider(FORK_URI))

ending_blocknumber = 19875687
starting_blocknumber = 19875620

deployer_addr = "0x26D756D057513a43b89735CBd581d5B6eD1b0711"


def getTransactions(start, end, address):
    total_gas = 0
    for x in range(start, end):
        block = w3.eth.get_block(x, True)
        for transaction in block.transactions:
            if transaction['from'] == address:
                gas_used = transaction['gas']
                print(gas_used)

                total_gas += gas_used
    
    print()
    print("Total : " + str(total_gas))
    

getTransactions(starting_blocknumber, ending_blocknumber, deployer_addr)
