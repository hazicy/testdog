# Node plugins

`api.ts` is the host-neutral API. `runAdapter.ts` translates plans, execution steps and evidence into its node snapshots; plugins do not depend on React or run storage.

To add a built-in plugin, implement `NodePlugin`, register it in `registry.ts`, and add its translated label to both message catalogs. `accepts(node)` decides which nodes can be selected. `execute(context)` receives node input/output snapshots, named groups of node IDs, and `readAsset(id)` for authenticated evidence access. It returns structured `data`, downloadable `files`, or both. Processing and export logic belong in the plugin.

The host validates group membership and supported node types, clones input/output data before invocation, and downloads returned files. Historical run records remain immutable. Asset access uses existing authenticated run endpoints and is restricted to assets in the current context. Built-in plugins run as trusted application code; this is not a sandbox for third-party JavaScript.

The Excel acceptance plugin accepts screenshot nodes. Each user-created group becomes one worksheet; every associated screenshot gets a row with the node input/output and blank acceptance and notes fields. Groups are local to the current page and reset when changing runs or plugins. Missing or unsupported evidence fails the export rather than silently omitting screenshots.

## Execution plugins

Execution plugins are canvas tasks with `actionType: 'plugin'` and a `plugin: { id, config }` invocation. Shared metadata, defaults and validation live in `packages/contracts/src/plugins/execution.ts`. The plan runner dispatches a generic Web plugin action without asking a model to implement it. `WebExecutionPlugins` owns response interception for the browser context, reports results to the recorded step and removes only its own routes on session close. Replay stores the invocation inside the existing action JSON; the editable recording dialect uses `runPlugin(page1, "<JSON invocation>")`.

The plugin directory lists both result-processing and execution plugins. Open Volcengine A/B testing to save account-owned endpoint settings and an experiment/group mapping. `plugin_settings` stores these settings with an optimistic version; `/api/plugins` reads the current account and `/api/plugins/[pluginId]` saves validated settings. Other accounts cannot read or change them.

Configure shared settings once:

- Response URL contains: literal request URL substring, default `/service/2/abtest_config/`.
- Response path: JSON Pointer to the experiment map, default `/data`; empty means the response root. Escape `/` as `~1` and `~` as `~0` in path segments.
- Experiment key and groups: each named group defines the JSON value written to `val`, plus an optional `vid` replacement. Group names must be unique within an experiment; keys must be unique across experiments.

Canvas nodes contain only `{ key, group }`. On submission, the server resolves the current account's settings and freezes the full invocation into the execution plan. Saved cases remain selections so new recordings pick up current settings. Replay uses the resolved action snapshot from its original recording; updating plugin settings does not change old recordings. Existing expanded invocations remain supported.

For example, `{ "data": { "checkout": { "val": "A", "vid": "100" } } }` can become `{ "data": { "checkout": { "val": "B", "vid": "200" } } }`. The request still reaches the real service. Other fields are preserved. Multiple keys on the same endpoint are applied to one fetched response. A later invocation for the same URL substring, data path and key replaces the active rule; each invocation must actually intercept a request to pass. The reported output contains before/after values and the hit count. HTTP errors, invalid JSON, missing paths/keys/fields and unmatched rules fail the run. Service workers are blocked in run contexts so they cannot bypass interception.

Place a new Navigate after switching versions to trigger a fresh request. This changes only responses received by this browser context; it does not change the platform's stored assignment, server-side branching, or an SDK value that was already cached before the node ran. Real application response layouts must match the configured path and key. Export plugins can read the recorded plugin input and output through the existing run adapter.
