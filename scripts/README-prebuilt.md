# Prebuilt Library Publishing

This directory contains the script for building and publishing prebuilt Valdi framework libraries.

## Quick Start (Maintainers Only)

### Build and Publish Prebuilt Libraries

When releasing a new version:

```bash
# 1. Build all prebuilt libraries
./scripts/publish-prebuilt-libraries.sh

# 2. Create GitHub release
VERSION=$(grep '"version"' npm_modules/cli/package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
gh release create v$VERSION --title "v$VERSION" --notes "Release v$VERSION"

# 3. Upload prebuilt libraries
gh release upload v$VERSION prebuilt-output/*.tar.gz

# 4. Verify
gh release view v$VERSION
```

## What Gets Built

The script builds:
- `valdi-framework-ios-debug.tar.gz` - iOS debug XCFramework
- `valdi-framework-ios-release.tar.gz` - iOS release XCFramework
- `valdi-framework-android-debug.tar.gz` - Android debug AAR
- `valdi-framework-android-release.tar.gz` - Android release AAR

Each archive includes:
- Compiled Valdi C++ runtime
- All core Valdi modules (compiled)
- Platform-specific bindings
- Third-party dependencies

## Requirements

- Bazel installed and working
- Xcode (for iOS builds on macOS)
- Android SDK (for Android builds)
- GitHub CLI (`gh`) for publishing

## For More Information

See [/docs/prebuilt-libraries.md](/docs/prebuilt-libraries.md) for complete documentation.
