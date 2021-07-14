# SubQuery Common API for Polkadot

We believe that the DApps ecosystem will benefit from a common core API that each parachain can integrate (and extend) to index and expose their chain data for future consumer facing applications (e.g. a wallet, explorer, or other dApp).

We are aiming to create an open-source SubQuery Project for common app and network data. This will be accompanied by documentation and learning materials

## Outcomes

1. __Improve the Interoperability of DApps and Parachains__: Defined and maintained common core data API interface for Polkadot, Kusama, and other parachains. Just like Substrate defines a standard interface API that parachain developers can adopt, extend, and modify - decentralised application developers would benefit from a standard API for common use cases that they can also adopt, extend, and modify.
2. __Attract and Support More Developers in Kusama__: Provide a starting point for consumer facing dApp developers to get started with Polkadot and Kusama

# Running this Project

## In the SubQuery Explorer

This project will soon be uploaded to the SubQuery Explorer for you to play around with

## Run a local version

Requirements:
- [Typescript](https://www.typescriptlang.org/) are required to compile project and define types.  
- Both SubQuery CLI and the generated Project have dependencies that require [Node](https://nodejs.org/en/).
     
Install SubQuery CLI globally on your terminal by using Yarn or NPM:

```shell
# Yarn
yarn global add @subql/cli

# NPM
npm install -g @subql/cli
```

Under the project directory, run the following command to install the project's dependencies.

```shell
# Yarn
yarn install

# NPM
npm install
```

Generate the required GraphQL models

```shell
# Yarn
yarn codegen

# NPM
npm run-script codegen
```

Build the project locally

```shell
# Yarn
yarn build

# NPM
npm run-script build
```

Run following command to run using docker or [read more about different ways to run a SubQuery project](https://doc.subquery.network/run/run.html)

```
docker-compose pull && docker-compose up
```

Open your browser and head to `http://localhost:3000`.

You should see a GraphQL playground is showing in the explorer and the schemas that ready to query. On the top right of the playground, you'll find a Docs button that will open a documentation draw. This documentation is automatically generated and helps you find what entities and methods you can query.

# Design Decision Log

## Custom Chain Extrinsic Handling 

We want to record extrinsics and their data from the chain, so we need to determine a fixed entity structure. However, the extrinsics structure may change significantly between each parachain and versions within that parachain.

__Solution__

We have versioned the Extrinsic entity, current latest is `ExtrinsicV4`. A new versioned entity may be needed for new versions of extrinsic.

__Pros:__ The structure of different versions will be fixed, and there is no need to update the table structure when there is a new version.

__Cons:__ When the query needs to traverse all extrinsics, or when aggregate data is needed, this design will not be particularly friendly.

## Historic v Latest Balances 

Calculating and maintaing the current balance of an account is hard, especially when supporting balances of accounts with multiple assets on a custom chain. We already know balance can be obtained through `api.query.system.account`, but it is not certain in what scenario and when to trigger this update. We cannot be sure that we will monitor all events/extrinsic that may affect the account balance. 

__Solution__

When indexing each block, we extract all the `accountId`s and `assetId`s involved in all events and extrinsics. We then make queries for each `accountId`/`assetId` pair for latest balances and update the `AccountBalance` on any change.

If a chain supports multiple assets, `AccountBalance` id which is formed by `account_id - assert_id`, which represent balance for this account in this asset. Else only `account_id` will be stored.

__Pros:__ Will not miss any update for the account.

__Cons:__ Not the most efficient way to check for updated account balances. For example, a block contains a large number of different `accountId`, only one or two account balances actually changed, and we will query all of them one by one anyway. 

# Future Improvements
 
- Create an entity to record the change of account balance and record the type of transaction as detailed as possible.
