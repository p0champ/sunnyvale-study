# GPT fixes branch — concurrent gesture test

All code work is on gpt-fixes, based on main 3d76373. No main push or merge. Claude owns the Jarvis gesture section and its debug helpers; they are not part of these edits.

## 1. Bridge and connector

The F: drive was unavailable in this session. Local port 8130 was not listening; Tailscale Funnel was configured and returned 502 because the local bridge was absent. A fresh separate checkout was pulled from main. The unchanged bridge was started ONCE from that checkout using the preserved private settings in Documents/Sunnyvale private copy. No PC Sunnyvale frontend connected, and no existing bridge was stopped. Local/public health now pass. Authenticated public MCP checks pass with 73 tools, while missing credentials receive 401. Saved Quest and connector links already use the permanent address; no replacement is needed.

The checker/setup writer now prefer public-address.txt, support BRIDGE_PRIVATE_DIR, validate settings, and suppress errors that could expose credential-bearing URLs. The normal Chrome extension is not yet connected at this checkpoint. If claude.ai retains an earlier error, refresh Claude and retry its connector.

The missing project drive has been raised with the user; do not silently overwrite or replace the canonical F: checkout. Private links/credentials remain outside Git.
