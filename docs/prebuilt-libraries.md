# Valdi Prebuilt Libraries

This document describes the prebuilt library system for Valdi, which significantly reduces build times by downloading pre-compiled framework binaries instead of building from source.

## Overview

The Valdi prebuilt library system allows users to:
- **Skip compilation** of the Valdi C++ runtime, core modules, and third-party dependencies
- **Reduce build times** from minutes to seconds for initial setup
- **Simplify dependencies** by not requiring a full C++ build toolchain

## For Users

### Using Prebuilt Libraries (Default)

When creating a new Valdi project, prebuilt libraries are downloaded by default:

```bash
mkdir my-valdi-app
cd my-valdi-app
valdi bootstrap
```

The bootstrap command will:
1. Set up your project structure
2. Download prebuilt Valdi frameworks for iOS and Android (debug builds)
3. Cache them in `~/.valdi/prebuilt/` for reuse

### Opting Out

If you prefer to build from source (e.g., for custom modifications):

```bash
valdi bootstrap --no-prebuilt
```

### Cache Management

Prebuilt libraries are cached in `~/.valdi/prebuilt/{version}/{platform}-{config}/`.

To clear the cache:

```bash
rm -rf ~/.valdi/prebuilt
```

## For Maintainers

### Publishing Prebuilt Libraries

When releasing a new version of Valdi, maintainers should build and publish prebuilt libraries:

#### 1. Build All Prebuilt Libraries

```bash
cd /path/to/Valdi
./scripts/publish-prebuilt-libraries.sh
```

This script will:
- Build the `valdi_framework` export target for multiple platforms and configurations:
  - iOS (debug & release)
  - Android (debug & release)
  - macOS (optional)
- Package each as a `.tar.gz` archive
- Calculate SHA256 checksums
- Output all files to `./prebuilt-output/`

Expected output:
```
valdi-framework-ios-debug.tar.gz
valdi-framework-ios-debug.tar.gz.sha256
valdi-framework-ios-release.tar.gz
valdi-framework-ios-release.tar.gz.sha256
valdi-framework-android-debug.tar.gz
valdi-framework-android-debug.tar.gz.sha256
valdi-framework-android-release.tar.gz
valdi-framework-android-release.tar.gz.sha256
```

#### 2. Create GitHub Release

```bash
# Get version from package.json
VERSION=$(grep '"version"' npm_modules/cli/package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
VERSION_TAG="v$VERSION"

# Create release
gh release create $VERSION_TAG \
  --title "$VERSION_TAG" \
  --notes "Valdi $VERSION_TAG with prebuilt framework libraries"
```

#### 3. Upload Prebuilt Libraries

```bash
gh release upload $VERSION_TAG prebuilt-output/*.tar.gz
```

#### 4. Verify Release

Check that all files are uploaded:
```bash
gh release view $VERSION_TAG
```

Or visit: `https://github.com/peterbrook/Valdi/releases/tag/$VERSION_TAG`

## Architecture

### Components

1. **Export Target** (`/BUILD.bazel`)
   - `valdi_framework` - Exported library target containing all core Valdi modules
   - Uses `valdi_exported_library` macro to generate platform-specific artifacts

2. **Prebuilt Library Manager** (`npm_modules/cli/src/utils/PrebuiltLibrary.ts`)
   - Downloads prebuilt libraries from GitHub Releases
   - Caches locally in `~/.valdi/prebuilt/`
   - Verifies downloads (future: checksum validation)

3. **Bootstrap Integration** (`npm_modules/cli/src/commands/bootstrap.ts`)
   - Downloads prebuilt libraries during project setup
   - Controlled via `--use-prebuilt` flag (default: true)

4. **Publish Script** (`scripts/publish-prebuilt-libraries.sh`)
   - Builds all platform/configuration combinations
   - Packages as `.tar.gz` archives
   - Generates checksums

### Framework Contents

The `valdi_framework` export includes:
- Valdi C++ runtime
- Valdi core TypeScript modules (compiled)
- Core Valdi modules:
  - foundation
  - valdi_core
  - valdi_tsx
  - valdi_http
  - valdi_protobuf
  - valdi_test
  - web_renderer
  - drawing
  - persistence
  - file_system
  - And more...

### What Still Builds

Even with prebuilt libraries, the following still compile:
- **User application code** - Your Valdi TypeScript/TSX modules
- **User-specific configuration** - Bundle IDs, app icons, resources
- **Third-party app dependencies** - Any additional libraries you add

## Performance Impact

Expected time savings:

| Operation | Without Prebuilt | With Prebuilt | Improvement |
|-----------|-----------------|---------------|-------------|
| `valdi bootstrap` | ~5-10 minutes | ~30 seconds | **90% faster** |
| First `valdi install ios` | ~10-15 minutes | ~2-3 minutes | **80% faster** |
| Subsequent builds | ~2-5 minutes | ~1-2 minutes | **50% faster** |

*Note: Actual times depend on your machine specs and network speed.*

## Troubleshooting

### Prebuilt Download Fails

If prebuilt libraries fail to download:

1. **Check internet connection**
2. **Verify the release exists**: Visit `https://github.com/peterbrook/Valdi/releases`
3. **Use `--no-prebuilt` flag**: Fall back to building from source
   ```bash
   valdi bootstrap --no-prebuilt
   ```

### Wrong Version Downloaded

Clear the cache and re-download:

```bash
rm -rf ~/.valdi/prebuilt
valdi bootstrap --with-cleanup
```

### Build Fails with Prebuilt

If builds fail unexpectedly with prebuilt libraries:

1. Try clearing Bazel cache:
   ```bash
   bazel clean --expunge
   ```

2. Rebuild without prebuilt:
   ```bash
   valdi bootstrap --with-cleanup --no-prebuilt
   ```

## Future Enhancements

- [ ] Checksum verification for downloads
- [ ] Support for release/debug variants during install
- [ ] Automatic prebuilt selection based on platform
- [ ] CDN hosting for faster downloads
- [ ] Binary diffs for incremental updates
- [ ] Integration with Bazel remote cache

## Related Files

- `/BUILD.bazel` - Export target definition
- `/scripts/publish-prebuilt-libraries.sh` - Maintainer build script
- `/npm_modules/cli/src/utils/PrebuiltLibrary.ts` - Download manager
- `/npm_modules/cli/src/commands/bootstrap.ts` - Bootstrap integration
