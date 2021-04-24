export type GraphQLError = {
  message: string;
  locations: {
    line: number;
    column: number;
  }[];
  path: (string | number)[];
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
   * If this function is not provided the client will throw
   * an Error when the HTTP request has a non-ok status.
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

function ok<TData>(data: TData): GraphQLResponse<TData, never> {
  return {
    isOk: true,
    ok: action => action(data),
    isErr: false,
    err: () => {},
    match: config => config.ok(data),
    mapOk: mapFn => ok(mapFn(data)),
    mapErr: () => ok(data),
  };
}

function err<TError>(error: TError | TError[]): GraphQLResponse<never, TError> {
  const errors = Array.isArray(error) ? error : [error];
  return {
    isOk: false,
    ok: () => {},
    isErr: true,
    err: action => action(errors),
    match: config => config.err(errors),
    mapOk: () => err(errors),
    mapErr: mapFn => err(mapFn(errors)),
  };
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

  if (!response.ok) {
    if (config.onHttpError) {
      const mappedError = await Promise.resolve(config.onHttpError(request, response));
      return err(mappedError);
    }

    throw new Error(`[GraphQL] HTTP request failed with status: ${response.status} (${response.statusText})`);
  }

  const { data, error } = await response.json();
  if (data !== undefined) return ok<TData>(data);
  if (error !== undefined) {
    // if there is no data handler/mapper return the error right away
    if (!config.onError) return err<TError>(error);

    const errors = Array.isArray(error) ? error : [error];
    const mappedError = await Promise.resolve(config.onError(error));
    return err<TError>(mappedError ? mappedError : errors);
  }

  throw new Error(
    '[GraphQL] Expected properties \'data\' or \'error\' in the response body. Neither was available.'
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
