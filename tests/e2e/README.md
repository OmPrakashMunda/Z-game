# Browser tests

These scripts drive the real game in headless Chrome with [playwright-core](https://playwright.dev/) and check what a
player would see. They need `npm run dev` (the game's dev hooks, `window.__game`, are not in the production build), and
`run.ps1` starts the dev server for you.

```
cd tests\e2e
npm install
cd ..\..
pwsh tests\e2e\run.ps1                  # all of them
pwsh tests\e2e\run.ps1 -Only cheats     # one or more, by name without .mjs
```

- Chrome is expected at `C:\Program Files\Google\Chrome\Application\chrome.exe`. Set `CHROME_PATH` to use another.
- The browser uses software rendering (SwiftShader), so there is no GPU and the frame rate is low. The tests wait for
  that. They do not measure speed.
- Screenshots are written to `tests/e2e/shots` (ignored by git), or to `SHOTS_DIR`.
- Each script prints `PASS` or `FAIL` for every check and ends with `N passed, M failed`.

See [Testing](../../docs/wiki/Testing.md) for what each script covers.
