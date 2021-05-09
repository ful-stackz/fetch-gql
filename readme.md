# Fetch GraphQL data

A zero-dependency, typed GraphQL client library built on top of `fetch` that provides monadic-ish responses for the tiny extra but of safety.

Same, but with bullets:

- zero-dependencies, built entirely on top of `fetch`
- execute GraphQL queries and mutations with type-safe variables and responses
- handle responses explicitly in a monadic-ish way for the extra runtime safety

## Install

The package is hosted at [npm](https://npmjs.com/package/fetch-gql)

```bash
npm install --save fetch-gql
```

## Usage


### Basic usage

The most basic usage example is to create a GraphQL client instance, define some query/mutation types, execute them and handle the response.

```typescript
import createClient from 'fetch-gql'

const client = createClient({
  url: '<your-graphql-endpoint-url>'
})

type GetUserQuery = { user: { id: number; username: string } }
type GetUserQueryVariables = { id: number }
const getUserQuery = `
  query getUser(id: Int!) {
    user(id: $id) {
      id
      username
    }
  }
`

const response = await client.query<GetUserQuery, GetUserQueryVariables>({
  query: getUserQuery,
  variables: { id: 1 } // type checked against GetUserQueryVariables
})

response.match({
  ok: data => { // data is of type GetUserQuery
    const { user } = data
    console.log(user.id, user.username)
  },
  err: errors => { // errors is of type GraphQLError[]
    // handle errors
  }
})
```

For details on the `.match()` and the rest of the response-handling API check out the [explicit response handling](#explicit-response-handling) point.

### Custom error types

The [GraphQL spec](http://spec.graphql.org/draft/#sec-Errors) defines a default error shape that looks like this in a JSON response:

```json
{
  "errors": [
    {
      "message": "Name for character with ID 1002 could not be fetched.",
      "locations": [{ "line": 6, "column": 7 }],
      "path": ["hero", "heroFriends", 1, "name"]
    }
  ]
}
```

Accordingly, `fetch-gql` defines a default GraphQL error type which looks like this:

```typesript
type GraphQLError = {
  message: string
  locations: { line: number; column: number }[]
  path: (string | number)[]
}
```

But what if your server returns a custom error type? Whether your server follows the GraphQL error spec guidelines of utilising an `extensions` field which is a map of additional error details, or it returns a fully customized error type - `fetch-gql` has you covered!

When creating a new GraphQL client you can provide the error type that you expect to be returned from the server. The client will then provide type-safety when handling errors!

```typescript
import createClient, { GraphQLError } from 'fetch-gql'

type ServerErrorCode =
  | 'auth/wrong-password'
  | 'api/not-found'
  | 'api/duplicate-key'

// If the server follows the spec guidelines
// simply extend the default error type with
// a custom typed _extensions_ field
type ExtendedGraphQLError = GraphQLError & {
  extensions: {
    code: ServerErrorCode
  }
}

// If the server returns a fully customized error type
// simply define the expected error type
type CustomGraphQLError = {
  message: string
  code: ServerErrorCode
}

const guidelinesClient = createClient<ExtendedGraphQLError>({ /* client config */ })
const response = await guidelinesClient.query<Query, QueryVariables>({ /* query config */ })
response.err(errors => { }) // errors is of type ExtendedGraphQLError[]

const customErrorClient = createClient<CustomGraphQLError>({ /* client config */ })
const response = await customErrorClient.query({ /* query config */ })
response.err(errors => { }) // errors is of type CustomGraphQLError[]
```

## Explicit response handling

In order to provide an extra bit of safety, `fetch-gql` exposes a monadic-ish API for handling the response of the GraphQL query or mutation. If you are not acquinted with that style of programming don't worry it's really simple and easy to use.

Each query/mutation executed via the client returns a response of type `GraphQLResponse<TData, TError>` where `TData` is the type of the data returned on a successful request and `TError` is the type of an error returned on a non-successful request. `fetch-gql` provides the following API for handling both cases:

```typescript
const response = await client.query({ /* query config */ })

// get a boolean indicating whether the response contains data
response.isOk

// get a boolean indicating whether the response contains error(s)
response.isErr

// execute the provided function when the response contains data,
// providing said data as an argument
// if the response does not contain data the function is not executed
response.ok(data => { })

// execute the provided function when the response contains error(s),
// providing said error(s) as an argument
// if the response does not contain error(s) the function is not executed
response.err(errors => { })

// groups the .ok() and .err() in a single endpoint
response.match({
  ok: data => { },
  err: errors => { }
})

// maps the response data, when available, to another shape _T_ and
// returns a new GraphQLResponse<T, TError> object
// if the response does not contain data the original is returned
response.mapOk(data => { })
// you can then chain one of the other functions described in this section
response.mapOk(data => { })
  .match({ ok: data => { }, err: errors => { } })

// maps the response error(s), when available, to another shape _T_ and
// returns a new GraphQLResponse<TData, T> object
// if the response does not contain error(s) the original is returned
response.mapErr(errors => { })
// you can then chain any of the other functions described in this section
response.mapErrors(errors => { })
  .match({ ok: data => { }, err: errors => { } })
```

## Todo

- [ ] link sample projects (git submodules?)
- [ ] add tests
- [ ] add nice documentation (with [docusaurus](https://docusaurus.io/)?)

## Contribution

Suggestions, insights, bug reports and code contributions are all welcome. File an issue or open a pull request - thank you!
