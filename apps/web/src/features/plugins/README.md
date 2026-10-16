# Node plugins

`api.ts` is the host-neutral API. `runAdapter.ts` translates plans, execution steps and evidence into its node snapshots; plugins do not depend on React or run storage.

To add a built-in plugin, implement `NodePlugin`, register it in `registry.ts`, and add its translated label to both message catalogs. `accepts(node)` decides which nodes can be selected. `execute(context)` receives node input/output snapshots, named groups of node IDs, and `readAsset(id)` for authenticated evidence access. It returns structured `data`, downloadable `files`, or both. Processing and export logic belong in the plugin.

The host validates group membership and supported node types, clones input/output data before invocation, and downloads returned files. Historical run records remain immutable. Asset access uses existing authenticated run endpoints and is restricted to assets in the current context. Built-in plugins run as trusted application code; this is not a sandbox for third-party JavaScript.

The Excel acceptance plugin accepts screenshot nodes. Each user-created group becomes one worksheet; every associated screenshot gets a row with the node input/output and blank acceptance and notes fields. Groups are local to the current page and reset when changing runs or plugins. Missing or unsupported evidence fails the export rather than silently omitting screenshots.
