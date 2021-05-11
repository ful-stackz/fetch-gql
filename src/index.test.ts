import fetchMock, { enableFetchMocks } from 'jest-fetch-mock';
enableFetchMocks();

import createClient, { GraphQLError } from './index';

type LoginMutation = {
  login: {
    id: number;
    username: string;
    token: string;
  };
}

type LoginMutationVariables = { username: string; password: string }

type GetUserQuery = {
  user: {
    id: number;
    username: string;
    email: string;
  };
}

type GetUserQueryVariables = { token: string }

type CustomError = { code: number }

const Responses = {
  ok: {
    login: () => JSON.stringify({
      data: {
        login: {
          id: 1,
          username: 'test',
          token: 'ooh-secret',
        },
      },
    }),
    user: () => JSON.stringify({
      data: {
        user: {
          id: 1,
          username: 'test',
          email: 'test@test.com',
        },
      },
    }),
  },
  err: {
    standard: () => JSON.stringify({
      errors: [
        {
          message: 'Name for character with ID 1002 could not be fetched.',
          locations: [{ line: 6, column: 7 }],
          path: ['hero', 'heroFriends', 1, 'name']
        },
      ],
    }),
    simple: () => JSON.stringify({
      errors: [
        {
          message: 'Simple error',
          locations: [],
          path: [],
        },
      ]
    }),
  },
};

beforeEach(() => {
  fetchMock.doMock();
  fetchMock.resetMocks();
});

describe('Client uses configuration', () => {
  test('Uses configuration url and headers', async () => {
    const client = createClient({
      url: 'https://fake.it/',
      headers: {
        'authorization': 'bearer abcd',
        'x-secrets-key': 'super secret',
      },
    });

    fetchMock.mockIf(req => {
      expect(req.url).toBe('https://fake.it/');
      expect(req.method).toBe('POST');
      expect(req.headers.get('content-type')).toBe('application/json');
      expect(req.headers.get('authorization')).toBe('bearer abcd');
      expect(req.headers.get('x-secrets-key')).toBe('super secret');
      return true;
    }, Responses.ok.login());

    const { isOk } = await client.query({ query: '' });
    expect(isOk).toBe(true);
  });

  test('Uses preRequest configuration function', async () => {
    const client = createClient({
      url: 'https://fake.it/',
      preRequest: base => {
        const req = base();
        req.headers.append('custom-header', 'custom value');
        return req;
      },
    });

    fetchMock.mockIf(req => {
      expect(req.headers.get('custom-header')).toBe('custom value');
      return true;
    }, Responses.ok.login());

    const { isOk } = await client.query({ query: '' });
    expect(isOk).toBe(true);
  });
});

describe('Client handles ok responses', () => {
  test('Invokes ok handlers on success', async () => {
    fetchMock.mockResponseOnce(Responses.ok.login());

    const client = createClient({ url: 'http://fake.it' });
    const response = await client.query<LoginMutation>({ query: '' });

    expect(response.isOk).toBe(true);
    expect(response.isErr).toBe(false);
    response.mapErr(() => {
      fail('mapErr() should not be called on an ok response');
    });
    response.err(() => {
      fail('err() should not be called on an ok response');
    });
    response.ok(data => {
      expect(data.login.id).toBe(1);
      expect(data.login.username).toBe('test');
      expect(data.login.token).toBe('ooh-secret');
    });
    response.match({
      ok: data => {
        expect(data.login.id).toBe(1);
        expect(data.login.username).toBe('test');
        expect(data.login.token).toBe('ooh-secret');
      },
      err: errors => {
        fail(errors);
      }
    });
  });
});

describe('Client handles error responses', () => {
  test('Invokes error handlers on error', async () => {
    fetchMock.mockResponse(Responses.err.standard());

    const client = createClient({ url: 'https://fake.it' });
    const response = await client.query({ query: '' });

    function verifyErrors(errors: GraphQLError[]) {
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('Name for character with ID 1002 could not be fetched.');
      expect(errors[0].path).toEqual(['hero', 'heroFriends', 1, 'name']);
      expect(errors[0].locations).toEqual([{ line: 6, column: 7 }]);
    }

    expect(response.isOk).toBe(false);
    expect(response.isErr).toBe(true);
    response.err(errors => verifyErrors(errors));
    response.mapErr(errors => errors.map(e => e.message)).err(errors => {
      expect(errors).toEqual<string[]>(['Name for character with ID 1002 could not be fetched.']);
    });
    response.mapOk(() => fail('mapOk() should not be called on an error response'));
    response.match({
      ok: () => {
        fail('map.ok() should not be called on an error response');
      },
      err: errors => {
        verifyErrors(errors);
      },
    });
    response.ok(() => fail('ok() should not be called on an error response'));
  });

  test('Maps to custom error type', async () => {
    fetchMock.mockResponse(Responses.err.standard());

    const client = createClient<CustomError>({
      url: 'https://fake.it/',
      onError: errors => errors.map(() => ({ code: 200 })),
    });
    const response = await client.query({ query: '' });

    expect(response.isOk).toBe(false);
    expect(response.isErr).toBe(true);
    response.match({
      ok: () => {
        fail('match.ok() should not be called on an error response');
      },
      err: errors => {
        expect(errors.length).toBe(1);
        expect(errors[0].code).toBe(200);
      }
    });
  });

  test('Does not invoke HTTP error handler when the response contains errors field', async () => {
    fetchMock.mockResponse(Responses.err.simple(), { status: 500, statusText: 'InternalError' });

    const client = createClient<GraphQLError>({
      url: 'https://fake.it/',
      onHttpError: () => {
        fail('HTTP error handler should not be invoked when response contains `errors` field');
      },
    });
    const response = await client.query({ query: '' });

    response.match({
      ok: () => {
        fail('match.ok() should not be called for an error response');
      },
      err: errors => {
        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe('Simple error');
      }
    });
  });

  test('Maps HTTP errors as configured', async () => {
    fetchMock.mockResponse('', { status: 500, statusText: 'InternalError' });

    const client = createClient({
      url: 'https://fake.it/',
      onHttpError: (_req, res) => ({
        message: `${res.statusText} (${res.status})`,
        locations: [],
        path: []
      }),
    });
    const response = await client.query({ query: '' });

    response.match({
      ok: () => {
        fail('match.ok() should not be called for an error response');
      },
      err: errors => {
        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe('InternalError (500)');
      }
    });
  });

  test('Pipes mapped HTTP errors to configured error handler', async () => {
    fetchMock.mockResponse('', { status: 500, statusText: 'InternalError' });

    const client = createClient({
      url: 'https://fake.it/',
      onHttpError: (_req, res) => ({
        message: `${res.statusText} (${res.status})`,
        locations: [],
        path: []
      }),
      onError: () => ({
        message: 'remapped error',
        locations: [],
        path: [],
      }),
    });
    const response = await client.query({ query: '' });

    response.match({
      ok: () => {
        fail('match.ok() should not be called for an error response');
      },
      err: errors => {
        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe('remapped error');
      }
    });
  });
});

describe('Sequential requests', () => {
  test('Same error type client flow works', async () => {
    const client = createClient({ url: 'https://fake.it/' });
    fetchMock.mockResponse(async req => {
      const body = await req.json();
      const query: string = body.query;

      if (query.startsWith('query user')) {
        const variables: GetUserQueryVariables = body.variables;
        expect(variables.token).toBe('ooh-secret');
        return Responses.ok.user();
      }

      // if it's not the user query then it's the login mutation request
      return Responses.ok.login();
    });

    const login = await client.query<LoginMutation>({ query: '' });
    const user = await login.andThen(data => client.query<GetUserQuery, GetUserQueryVariables>({
      query: 'query user($id: Int!) { user(id: $id) { id, username, email } }',
      variables: { token: data.login.token },
    }));
    user.match({
      ok: data => {
        expect(data.user.id).toBe(1);
        expect(data.user.email).toBe('test@test.com');
        expect(data.user.username).toBe('test');
      },
      err: errors => {
        fail(errors);
      },
    });
  });

  test('Different error types clients flow works', async () => {
    const client = createClient({ url: 'https://fake.it/' });
    const customErrClient = createClient<CustomError>({ url: 'https://fake.it/' });

    fetchMock.mockResponse(async req => {
      const body = await req.json();
      const query: string = body.query;

      if (query.startsWith('query user')) {
        const variables: GetUserQueryVariables = body.variables;
        expect(variables.token).toBe('ooh-secret');
        return Responses.ok.user();
      }

      // if it's not the user query then it's the login mutation request
      return Responses.ok.login();
    });

    const login = await client.query<LoginMutation>({ query: '' });
    const user = await login.andThen({
      action: data => customErrClient.query<GetUserQuery, GetUserQueryVariables>({
        query: 'query user($id: Int!) { user(id: $id) { id, username, email } }',
        variables: { token: data.login.token },
      }),
      mapErr: (errors): never => {
        fail(errors);
      }
    });
    user.match({
      ok: data => {
        expect(data.user.id).toBe(1);
        expect(data.user.email).toBe('test@test.com');
        expect(data.user.username).toBe('test');
      },
      err: errors => {
        fail(errors);
      },
    });
  });

  test('Returns first error when first request fails', async () => {
    const client = createClient({ url: 'https://fake.it/' });

    fetchMock.mockOnce(Responses.err.simple()).mockOnce(Responses.ok.user());

    const login = await client.query<LoginMutation>({ query: '' });
    const user = await login.andThen(() => client.query<GetUserQuery>({ query: '' }));
    user.match({
      ok: () => {
        fail('match.ok() should not be called on an error response');
      },
      err: errors => {
        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe('Simple error');
      }
    });
  });

  test('Returns second error when second request fails', async () => {
    const client = createClient({ url: 'https://fake.it/' });

    fetchMock.mockOnce(Responses.ok.login()).mockOnce(Responses.err.simple());

    const login = await client.query({ query: '' });
    const user = await login.andThen(() => client.query({ query: '' }));
    user.match({
      ok: () => {
        fail('match.ok() should not be called on an error response');
      },
      err: errors => {
        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe('Simple error');
      }
    })
  });

  test('Maps second error in multi error types flow', async () => {
    const defClient = createClient({ url: 'https://fake.it/' });
    const cusClient = createClient<CustomError>({ url: 'https://fake.it/custom' });

    fetchMock
      .mockOnce(Responses.ok.login())
      .mockOnce(JSON.stringify({ errors: [ { code: 404 } ] }));

    const login = await defClient.query<LoginMutation>({ query: '' });
    const user = await login.andThen({
      action: () => cusClient.query<GetUserQuery>({ query: '' }),
      mapErr: errors => errors.map(e => ({
        locations: [],
        message: e.code.toString(),
        path: []
      })),
    });
    user.match({
      ok: () => {
        fail('match.ok() should not be called on an error response');
      },
      err: errors => {
        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe('404');
      }
    });
  });

  test('Works with multiple sequential requests', async () => {
    const client = createClient({ url: 'https://fake.it/' });

    fetchMock
      .mockOnce(Responses.ok.login())
      .mockOnce(Responses.ok.user())
      .mockOnce(JSON.stringify({ data: { posts: { count: 2 } } }));

    const login = await client.query({ query: '' });
    const user = await login.andThen(() => client.query({ query: '' }));
    const posts = await user.andThen(() => client.query<{ posts: { count: number } }>({ query: '' }));
    posts.match({
      ok: data => {
        expect(data.posts.count).toBe(2);
      },
      err: errors => {
        fail(errors);
      }
    });
  });
});
