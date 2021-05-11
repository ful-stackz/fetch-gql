# Changelog

All notable changes will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 1.2.0 - 2021-05-11

### Added

- support for handling non 200 responses as regular GraphQL responses
- pipe mapped HTTP errors to the `onError` handler

## 1.1.0 - 2021-04-28

### Added

- tests
- sequential requests with the `.andThen()` API

### Fixed

- changed the expected GraphQL response error field from _error_ to the standard _errors_

## 1.0.1 - 2021-04-24

### Fixed

- fixed the GraphQLError shape to match the default error shape defined in the [GraphQL error spec](http://spec.graphql.org/draft/#sec-Errors)
