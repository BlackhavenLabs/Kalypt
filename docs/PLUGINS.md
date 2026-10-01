# Plugins

Kalypt API v1 supports explicitly loaded local inspection plugins.

> Plugins are executable JavaScript and run with the same permissions as Kalypt. Only load code you trust. Kalypt never auto-discovers or downloads plugins.

A plugin is an ES module with a default export:

```js
export default {
  apiVersion: 1,
  id: 'acme.example',
  name: 'Acme example inspector',
  inspect(buffer, context) {
    return [{
      severity: 'medium',
      category: 'example',
      title: 'Example finding',
      message: 'Something worth reviewing was found.',
      evidence: 'redacted or non-sensitive evidence',
      confidence: 0.8,
      tags: ['acme']
    }];
  }
};
```

Load it explicitly:

```bash
kalypt scan ./thing --plugin ./my-plugin.mjs
```

`--plugin` may be repeated. Plugin categories are namespaced automatically as `plugin.<plugin-id>.<category>`.

The `context` object currently includes `apiVersion`, `source`, `name`, `type`, and `archiveDepth` when applicable. Plugin v1 is synchronous by design so recursive scans remain deterministic and bounded.

See `examples/plugins/suspicious-filename.mjs` for a complete example.
