---
sidebar_position: 1
---

# Introduction

`fetch-gql` is a tiny GraphQL client library built entirely on top of fetch. It comes packed with some nice features:

- executes GraphQL queries and mutations
- provides a type-safe interface for GraphQL variables, response data and errors
- supports defining a custom GraphQL error type
- provides a monadic(-ish) interface for handling GraphQL responses

## Alternatives

`fetch-gql` is not a complete GraphQL client as it does not support all available GraphQL features, for example subscriptions. More feature-complete clients include:

- [Apollo Client](https://www.apollographql.com/docs/react/) - has framework-specific packages for React, Vue, Svelte and more
- [villus](https://github.com/logaretm/villus) - a lightweight Vue GraphQL client
