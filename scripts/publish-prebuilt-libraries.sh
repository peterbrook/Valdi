#!/bin/bash

# Script to build and publish prebuilt Valdi framework libraries
# This script is used by Valdi maintainers to create prebuilt libraries
# that can be downloaded instead of building from source

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the version from package.json
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VALDI_ROOT="$SCRIPT_DIR/.."
PACKAGE_JSON="$VALDI_ROOT/npm_modules/cli/package.json"

if [ ! -f "$PACKAGE_JSON" ]; then
    echo -e "${RED}Error: Could not find package.json at $PACKAGE_JSON${NC}"
    exit 1
fi

VERSION=$(grep '"version"' "$PACKAGE_JSON" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
VERSION_TAG="v$VERSION"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Valdi Prebuilt Libraries Publisher${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Version: $VERSION_TAG${NC}"
echo ""

# Output directory for prebuilt libraries
OUTPUT_DIR="$VALDI_ROOT/prebuilt-output"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Function to build and package a library
build_and_package() {
    local platform=$1
    local config=$2
    local bazel_args=$3

    echo -e "${YELLOW}Building $platform ($config)...${NC}"

    # Determine the target and extension
    local target="//:valdi_framework_${platform}"
    local output_name="valdi-framework-${platform}-${config}"

    # Build with bazel
    echo "Running: bazel build $target $bazel_args"
    bazel build "$target" $bazel_args

    # Find the output file
    if [ "$platform" = "ios" ]; then
        # For iOS, bazel produces a .zip file containing the XCFramework
        local bazel_output=$(bazel cquery --output=files "$target" $bazel_args 2>/dev/null | head -1)
        if [ -z "$bazel_output" ] || [ ! -f "$bazel_output" ]; then
            echo -e "${RED}Error: Could not find bazel output for $target${NC}"
            return 1
        fi

        # Extract the xcframework and re-package as tar.gz
        local temp_dir=$(mktemp -d)
        unzip -q "$bazel_output" -d "$temp_dir"

        # Find the .xcframework directory
        local xcframework=$(find "$temp_dir" -name "*.xcframework" -type d | head -1)
        if [ -z "$xcframework" ]; then
            echo -e "${RED}Error: Could not find .xcframework in bazel output${NC}"
            rm -rf "$temp_dir"
            return 1
        fi

        # Create tar.gz
        pushd "$(dirname "$xcframework")" > /dev/null
        tar -czf "$OUTPUT_DIR/${output_name}.tar.gz" "$(basename "$xcframework")"
        popd > /dev/null

        rm -rf "$temp_dir"
    else
        # For Android, bazel produces an .aar file
        local bazel_output=$(bazel cquery --output=files "$target" $bazel_args 2>/dev/null | head -1)
        if [ -z "$bazel_output" ] || [ ! -f "$bazel_output" ]; then
            echo -e "${RED}Error: Could not find bazel output for $target${NC}"
            return 1
        fi

        # Create tar.gz containing the .aar
        local temp_dir=$(mktemp -d)
        cp "$bazel_output" "$temp_dir/"

        pushd "$temp_dir" > /dev/null
        tar -czf "$OUTPUT_DIR/${output_name}.tar.gz" "$(basename "$bazel_output")"
        popd > /dev/null

        rm -rf "$temp_dir"
    fi

    # Calculate checksum
    local checksum=$(sha256sum "$OUTPUT_DIR/${output_name}.tar.gz" | awk '{print $1}')
    echo "$checksum" > "$OUTPUT_DIR/${output_name}.tar.gz.sha256"

    echo -e "${GREEN}✓ Built and packaged: $output_name.tar.gz${NC}"
    echo -e "  SHA256: $checksum"
}

# Build iOS Debug
build_and_package "ios" "debug" "--repo_env=VALDI_PLATFORM_DEPENDENCIES=ios --ios_multi_cpus=arm64 --snap_flavor=platform_development"

# Build iOS Release
build_and_package "ios" "release" "--repo_env=VALDI_PLATFORM_DEPENDENCIES=ios --ios_multi_cpus=arm64 --snap_flavor=production -c opt"

# Build Android Debug
build_and_package "android" "debug" "--copt=-DANDROID_WITH_JNI --android_platforms=//:android_arm64 --snap_flavor=platform_development"

# Build Android Release
build_and_package "android" "release" "--copt=-DANDROID_WITH_JNI --android_platforms=//:android_arm64 --snap_flavor=production -c opt"

# Build macOS Debug (optional, if needed)
# build_and_package "macos" "debug" "--snap_flavor=platform_development"

# Build macOS Release (optional, if needed)
# build_and_package "macos" "release" "--snap_flavor=production -c opt"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Build Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Output directory: $OUTPUT_DIR${NC}"
echo ""
echo "Files created:"
ls -lh "$OUTPUT_DIR"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Next Steps:${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "1. Create a new GitHub release:"
echo -e "   ${YELLOW}gh release create $VERSION_TAG --title \"$VERSION_TAG\" --notes \"Prebuilt libraries for Valdi $VERSION_TAG\"${NC}"
echo ""
echo "2. Upload the prebuilt libraries:"
echo -e "   ${YELLOW}gh release upload $VERSION_TAG $OUTPUT_DIR/*.tar.gz${NC}"
echo ""
echo "3. Verify the release at:"
echo -e "   ${BLUE}https://github.com/peterbrook/Valdi/releases/tag/$VERSION_TAG${NC}"
echo ""
echo -e "${GREEN}Done!${NC}"
