---
sidebar_position: 3
---

# Usage

The most basic usage example is to create a GraphQL client instance, define some query/mutation types, execute them and handle the response.

```typescript title="main.ts"
import createClient from 'fetch-gql'

const client = createClient({
  url: '<graphql-endpoint-url>'
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

For details on the `.match()` and the rest of the response-handling API check out the [response handling](/docs/response-handling) page.
