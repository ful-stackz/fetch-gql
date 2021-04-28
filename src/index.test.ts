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

type LoginMutationVariables = {
  username: string;
  password: string;
}

const Responses = {
  ok: {
    login: () => JSON.stringify({
      data: {
        login: {
          id: 1,
          username: 'test',
          token: 'ooh-secret'
        }
      }
    })
  },
  err: {
    standard: () => JSON.stringify({
      errors: [
        {
          message: 'Name for character with ID 1002 could not be fetched.',
          locations: [{ line: 6, column: 7 }],
          path: ['hero', 'heroFriends', 1, 'name']
        }
      ]
    })
  }
}

beforeEach(() => {
  fetchMock.doMock();
  fetchMock.resetMocks();
});

describe('Client uses configuration', () => {
  test('Uses configuration values', async () => {
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


type CustomError = {
  code: number;
}

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
      url: '',
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

  test('Maps HTTP errors as configured', async () => {
    fetchMock.mockResponse('', { status: 500, statusText: 'InternalError' });

    const client = createClient({
      url: '',
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
});
