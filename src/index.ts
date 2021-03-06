export type GraphQLError = {
  message: string;
  locations: {
    line: number;
    column: number;
  }[];
  path: (string | number)[];
}

type AndThenConfig<T, TData, TError> = (data: TData) => Promise<GraphQLResponse<T, TError>>;

type AndThenMapConfig<T, E, TData, TError> = {
  action: (data: TData) => Promise<GraphQLResponse<T, E>>;
  mapErr: (errors: E[]) => TError[];
}

function isAndThenMapConfig<T, E, TData, TError>(value: any): value is AndThenMapConfig<T, E, TData, TError> {
  return value.mapErr !== undefined;
}

export type GraphQLResponse<TData, TError> = {
  /**
   * Indicates whether the response came back successful with data.
   */
  readonly isOk: boolean;

  /**
   * Executes the provided function if the response came back with data,
   * providing the data as a parameter.
   */
  ok: (action: (data: TData) => void) => void;

  /**
   * Indicates whether the response came back unsuccessful with error(s).
   */
  readonly isErr: boolean;

  /**
   * Executes the provided function if the response came back with error(s),
   * providing the error(s) as a parameter.
   */
  err: (action: (errors: TError[]) => void) => void;

  /**
   * Executes one of the provided functions depending on the status of the response.
   * If it came back successful with data - the `ok` function is executed.
   * Otherwise the `err` function is executed.
   */
  match: <T>(config: {
    ok: (data: TData) => T;
    err: (errors: TError[]) => T;
  }) =>T;

  /**
   * Maps the data that came back with a successful response to another data shape `T` and
   * returns a new `GraphQLResponse<T, TError>` object.
   * If the response came back with errors the original object is returned,
   * without applying the mapping function.
   */
  mapOk: <T>(mapFn: (data: TData) => T) => GraphQLResponse<T, TError>;

  /**
   * Maps the error(s) that came back with an unsuccessful response to another error shape `T` and
   * returns a new `GraphQLResponse<TData, T>` object.
   * If the response came back successful with data then the original object is returned,
   * without applying the mapping function.
   */
  mapErr: <T>(mapFn: (errors: TError[]) => T) => GraphQLResponse<TData, T>;

  /**
   * Uses the data that came back with a successful response to execute a follow-up GraphQL request.
   * If the response came back unsuccessful the original (error) response object is returned,
   * ignoring the follow-up request.
   *
   * If the follow-up request uses a client with the same error type as the previous request
   * you should then provide as a parameter a function that accepts the data returned with
   * the response of the previous request and produces another GraphQL request.
   *
   * Otherwise if the follow-up request uses a GraphQL client with a different error type
   * you should then provide as a parameter an object with two fields - `action` and `mapErr`.
   * The `action` field must be a function that accepts the data returned with the response
   * of the prevous request and produces another GraphQL request. The `mapErr` field must be
   * a function that accepts the errors returned from the follow-up request and maps them to
   * the error type of the previous request.
   */
  andThen: <T, E>(config:
    | AndThenConfig<T, TData, TError>
    | AndThenMapConfig<T, E, TData, TError>
  ) => Promise<GraphQLResponse<T, TError>>;
}

export type GraphQLQueryConfig<TVariables> = {
  query: string;
  variables?: TVariables;
}

export type GraphQLClient<TError> = {
  /**
   * Execute a GraphQL query or mutation.
   */
  query: <TData = any, TVariables = never>(
    config: GraphQLQueryConfig<TVariables>
  ) => Promise<GraphQLResponse<TData, TError>>;
}

export type GraphQLClientConfig<TError> = {
  /**
   * The URL at which to send the GraphQL HTTP POST requests.
   */
  url: string;

  /**
   * Handle or map an HTTP error to the error type of the client.
   * Return an empty array to "discard" errors.
   * Invoked when the response does not contain GraphQL fields (`data`, `errors`)
   * or the response body is not valid JSON. If this function
   * is not provided, those cases will raise an Error instead.
   */
  onHttpError?: (request: Request, response: Response) => TError | TError[] | Promise<TError | TError[]>;

  /**
   * Handle or map GraphQL errors globally, before the query initiator
   * gets back the response. Return an empty array to "discard" errors.
   * If this function is not provided or returns a falsey value
   * the original GraphQL errors are directly returned to the
   * request initiator.
   */
  onError?: (errors: TError[]) => TError | TError[] | void | Promise<TError | TError[] | void>;

  /**
   * A collection of headers to be used in every single request.
   */
  headers?: Record<string, string>;

  /**
   * Modify the request before it is sent. This function will be invoked before
   * each and every request is sent, providing the base request as a parameter.
   * The base request will contain the basics - url, method, body, and all headers,
   * if any, as provided with the `headers` config option.
   * To modify the request do not mutate the parameter but return a new @see Request object to be used.
   * The `createRequest` function creates a new Request object pre-populated with the basic details of the
   * request - URL (from config option), method (POST), the standard content-type headers,
   * body (from the request initiator; as stringified JSON), and all headers from the config option, if any.
   */
  preRequest?: (createRequest: () => Request) => Request | Promise<Request>;
}

function ok<TData, TError>(data: TData): GraphQLResponse<TData, TError> {
  return {
    isOk: true,
    ok: action => action(data),
    isErr: false,
    err: () => {},
    match: config => config.ok(data),
    mapOk: mapFn => ok(mapFn(data)),
    mapErr: () => ok(data),
    andThen: async <T, E>(
      config: AndThenConfig<T, TData, TError> | AndThenMapConfig<T, E, TData, TError>
    ): Promise<GraphQLResponse<T, TError>> => {
      if (isAndThenMapConfig<T, E, TData, TError>(config)) {
        const response = await config.action(data);
        return response.match({
          ok: d => ok(d),
          err: errors => err<T, TError>(config.mapErr(errors))
        });
      }

      return await config(data);
    }
  };
}

function err<TData, TError>(error: TError | TError[]): GraphQLResponse<TData, TError> {
  const errors = Array.isArray(error) ? error : [error];
  return {
    isOk: false,
    ok: () => {},
    isErr: true,
    err: action => action(errors),
    match: config => config.err(errors),
    mapOk: () => err(errors),
    mapErr: mapFn => err(mapFn(errors)),
    andThen: () => Promise.resolve(err(errors)),
  };
}

/**
 * Extracts the `data` and `errors` fields from the `response` and returns them bundled in an object
 * when at least one of them is present. If none are present or the deserialization fails returns `null`.
 * @param response An HTTP response containing possible GraphQL data.
 */
async function getResponseJson(response: Response): Promise<{ data?: any, errors?: any } | null> {
  try {
    const { data, errors } = await response.json();
    return (data || errors) ? { data, errors } : null;
  } catch (error) {
    return null;
  }
}

async function query<TData, TVariables, TError>(
  config: GraphQLQueryConfig<TVariables> & GraphQLClientConfig<TError>
): Promise<GraphQLResponse<TData, TError>> {
  const headers = new Headers();
  headers.append('x-request-type', 'GraphQL');
  headers.append('content-type', 'application/json');
  headers.append('accept', 'application/json');

  if (config.headers) {
    Object.keys(config.headers).forEach(key => {
      headers.append(key, config.headers[key]);
    });
  }

  const body = JSON.stringify({
    query: config.query,
    variables: config.variables,
  });

  const baseRequest = new Request(config.url, { body, headers, method: 'POST' });
  const request = config.preRequest
    ? await Promise.resolve(config.preRequest(() => baseRequest.clone()))
    : baseRequest;

  const response = await fetch(request);
  const responseBody = await getResponseJson(response);

  // if the response does not contain GraphQL fields or is not valid JSON
  // invoke HTTP error handler for possible error mapping
  // or throw an error if not provided
  if (!responseBody) {
    if (config.onHttpError) {
      let mappedHttpErrors = await Promise.resolve(config.onHttpError(request, response));
      if (!config.onError) return err<TData, TError>(mappedHttpErrors);

      mappedHttpErrors = Array.isArray(mappedHttpErrors) ? mappedHttpErrors : [mappedHttpErrors];
      const mappedErrorHandlerErrors = await Promise.resolve(config.onError(mappedHttpErrors));
      return err<TData, TError>(mappedErrorHandlerErrors ? mappedErrorHandlerErrors : mappedHttpErrors);
    }

    throw new Error(`[fetch-gql] HTTP request failed with status: ${response.status} (${response.statusText})`);
  }

  const { data, errors } = responseBody;
  if (data) return ok<TData, TError>(data);
  if (errors) {
    // if there is no data handler/mapper return the error right away
    if (!config.onError) return err<TData, TError>(errors);

    const errs = Array.isArray(errors) ? errors : [errors];
    const mappedError = await Promise.resolve(config.onError(errs));
    return err<TData, TError>(mappedError ? mappedError : errs);
  }

  throw new Error(
    '[fetch-gql] Expected properties \'data\' or \'errors\' in the response body. Neither was available.'
  );
}

/**
 * Creates a new GraphQL client with the provided configuration.
 * @param config Configure the GraphQL client
 */
export default function createClient<TError = GraphQLError>(
  config: GraphQLClientConfig<TError>
): GraphQLClient<TError> {
  return {
    query: <TData, TVariables = never>(
      queryConfig: GraphQLQueryConfig<TVariables>
    ) => query<TData, TVariables, TError>({ ...config, ...queryConfig }),
  }
}
