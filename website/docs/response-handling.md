---
sidebar_position: 4
---

# Response handling

In order to provide an extra bit of safety, `fetch-gql` exposes a monadic(-ish) API for handling the response of the GraphQL query or mutation. If you are not acquinted with that style of programming don't worry it's really simple and easy to use.

Each query/mutation executed via the client returns a response of type `GraphQLResponse<TData, TError>` where `TData` is the type of the data returned on a successful request and `TError` is the type of an error returned on a non-successful request.
