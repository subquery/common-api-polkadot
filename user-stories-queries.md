## Example queries against user stories. 

User should be able to see their account's operations history so that user can see which operations & how changed user's balance
### 1) User should be able to see their account's operations history so that user can see which operations & how changed user's balance
1. User should be able to see Staking rewards & slashes list so that user can understand their rewards history for Staking
2. User should be able to see Transfers list so that user can track the status of their transfers
```graphql
query{
	events(filter:{
    relatedAccounts:{
      contains: "12wVuvpApgpX6H2GYxiDH6ESwetMENe3dhxXLNsDbC2FLchb"  #filter account
    },
    or:[
        {
          and:[
          {module:{equalTo: "staking"}},
          {event:{equalTo:"Reward"}}
        ]},
        {
          and:[
          {module:{equalTo: "staking"}},
          {event:{equalTo:"Slash"}}
        ]},
        {
          and:[
          {module:{equalTo: "balance"}},
          {event:{equalTo:"Transfer"}}
        ]},
    ]
  }){
    nodes{
      id,
      module, #staking/balance
      event, #Reward/Slash/transfer
      parameters, #balance in 3rd parameter
      timestamp,
      relatedAccounts
    }
  }
}
```
3. User should be able to see Other operations (Extrinsics) so that user can track the rest of the activities for their account
4. User should be able to filter account’s operations history by type & time so that user can analyze their account’s history in a more convenient way
```graphql






query{
	extrinsics(filter:{
    signerId:{equalTo: "1GED8WxSNvh6qqwbbaBHve6XUYV8sRZQ2PkW3R2vwrmVdM6"}
    module: {equalTo:"staking"},
    call: {equalTo:"bondExtra"}
    timestamp: {greaterThan:"2021-08-02"}
  }){
    nodes{
      module,
      call,
      timestamp,
      extra
      events{
        nodes{
          module,
          event
          parameters
        }
      }
    }
  }
}
```

### 2) Nominators should be able to see their pending rewards so that they can be informed about them & proceed with payout them if needed
1. Validators should be able to see their pending rewards so that they can be payout them

### 3) Nominators & Validators should be able to see their total rewards amount for Staking so that they can analyze their profits

### 4) Nominators & Validators should be able to see how their Stake was changing so that they can analyze & validate it

You might consider to crate a "stakingBalance" table to track all staking event and bond balance changes
