# Public APIs Catalog

A local, structured copy of the [public-apis/public-apis](https://github.com/public-apis/public-apis)
list — 2,250 free third-party APIs across 51 categories, pulled from their README and
parsed into JSON so it's easy to search/filter from code instead of scrolling a markdown file.

There is nothing to "install" from the source repo — it's just a curated list of links to
APIs hosted by other companies/projects, each with its own signup and auth process. This
catalog only stores the **metadata** (name, category, description, link, auth type, HTTPS,
CORS support) — not credentials, not SDKs, not the APIs themselves.

## Contents

- [`data/public-apis.json`](./data/public-apis.json) — the full catalog, one object per API:
  ```json
  {
    "category": "Animals",
    "name": "Cats",
    "description": "Pictures of cats from Tumblr",
    "link": "https://docs.thecatapi.com/",
    "auth": "apiKey",
    "https": "Yes",
    "cors": "No"
  }
  ```
- [`scripts/query.mjs`](./scripts/query.mjs) — small CLI to list categories or search by
  name/category/auth from the terminal without opening the JSON by hand.

## Usage

```bash
# list all categories with counts
node public-apis-catalog/scripts/query.mjs categories

# list every API in a category
node public-apis-catalog/scripts/query.mjs category Weather

# search by name/description keyword
node public-apis-catalog/scripts/query.mjs search crypto

# only APIs that need no auth key at all
node public-apis-catalog/scripts/query.mjs noauth
```

## Refreshing

The source list changes often. To refresh, re-fetch
`https://raw.githubusercontent.com/public-apis/public-apis/master/README.md` and re-parse
the `### <Category>` tables (`API | Description | Auth | HTTPS | CORS`) into the same JSON
shape as above.

## Using an API from the catalog

Each entry is just metadata — to actually use one: open its `link`, read that project's own
docs, sign up if it requires `auth` other than `No`, and call it from your own code with
whatever key/token it issues. This catalog doesn't proxy, wrap, or authenticate on your
behalf.
