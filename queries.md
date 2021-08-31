## Example of user Stories against queries. 

User should be able to see their account's operations history so that user can see which operations & how changed user's balance
### 1) User should be able to see their account's operations history so that user can see which operations & how changed user's balance
1. User should be able to see Staking rewards & slashes list so that user can understand their rewards history for Staking
```graphql

```
2. User should be able to see Transfers list so that user can track the status of their transfers
3. User should be able to see Other operations (Extrinsics) so that user can track the rest of the activities for their account
4. User should be able to filter account’s operations history by type & time so that user can analyze their account’s history in a more convenient way







## Example queries for Polkadot on the following use cases. 


### Get historic transfers for a specific account

```graphql
query{
  transfers(filter:{
    or: [
      {fromId: {equalTo : "15rb4HVycC1KLHsdaSdV1x2TJAmUkD7PhubmhL3PnGv7RiGY"}},
      {toId:{equalTo:"15rb4HVycC1KLHsdaSdV1x2TJAmUkD7PhubmhL3PnGv7RiGY"}}
    ]
  }){
    totalCount #total transfers
    nodes{
      asset{  # type of asset
        symbol
        decimal
      }
      amount, #amout
      fromId, 
      toId,
      event{ #futher information
        id, 
        extrinsic{
          id
        }
        timestamp #when
      }
    }
  }
}
```

### Get details about accounts (including current balance)

```graphql

query{
  accounts(first: 100){ # for pagination
    nodes{
      id,
      pubKey, 
      identity, #identity info in json 
      nextNonce, 
      balanceHistory(first:1, filter:{  #get the latest balance
        assetId : {
          equalTo: "KSM_ASSET_ID"  # with particular asset
        }
      }){
        nodes{
          asset{
            symbol,
            decimal
          }
          freeAmount,
          reservedAmount,
          locked
        }
      }
    }
  }
}

```

### Get data for a graph off account balance changes over time

```graphql

query{
  account(id:"15rb4HVycC1KLHsdaSdV1x2TJAmUkD7PhubmhL3PnGv7RiGY"){  #for particular account
      balanceHistory(filter:{
        assetId : {
          equalTo: "KSM_ASSET_ID"  #for kusama asset
        }
      }){
        nodes{
          asset{
            symbol,
            decimal
          }
          freeAmount,
          reservedAmount,
          locked,
          timestamp
        }
      }
  }
}

```

Get historic slashes for a specific account
### Get historic reward data for a specific account

```graphql
query{
	events(filter:{
    relatedAccounts:{
      includes: "15rb4HVycC1KLHsdaSdV1x2TJAmUkD7PhubmhL3PnGv7RiGY"  #filter account
    },
    module:{
      equalTo: "staking"
    },
    event:{
      equalTo: "Slash"
    }
  }){
    nodes{
      id,
      parameters, #its payload
      extrinsicId, #link to its extrinsic
      timestamp
    }
  }
}


```

### Get historic reward data for a specific account

```graphql
query{
	events(filter:{
    relatedAccounts:{
      includes: "15rb4HVycC1KLHsdaSdV1x2TJAmUkD7PhubmhL3PnGv7RiGY"  #filter account
    },
    module:{
      equalTo: "staking"
    },
    event:{
      equalTo: "Reward"
    }
  }){
    nodes{
      id,
      parameters, #its payload
      extrinsicId, #link to its extrinsic
      timestamp
    }
  }
}

```


### Get payable staking rewards for specific Nominators

```graphql

query{
    payoutDetails(
      filter:{
        accountId:{
          equalTo: "15rb4HVycC1KLHsdaSdV1x2TJAmUkD7PhubmhL3PnGv7RiGY"
        },
        isClaimed:{
          equalTo: false #if it haven't been claimed,it is payable
        }
      }){
        nodes{
          id,
          eraId,
          amount,
          payout{
            totalPayout 
          }
        }
    }
}

```
