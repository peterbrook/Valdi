import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import { ANSI_COLORS } from '../core/constants';
import { CliError } from '../core/errors';
import { wrapInColor } from './logUtils';
import { decompressTo } from './zipUtils';
import { withTempDir } from './tempDir';

export interface PrebuiltLibraryConfig {
  platform: 'ios' | 'android' | 'macos';
  buildConfig: 'debug' | 'release';
  version: string;
}

export interface PrebuiltLibraryInfo {
  url: string;
  checksum: string;
  version: string;
}

/**
 * Manages downloading and caching pre-built Valdi framework libraries
 */
export class PrebuiltLibraryManager {
  private readonly cacheDir: string;
  private readonly githubRepo = 'peterbrook/Valdi';

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(process.env['HOME'] || '~', '.valdi', 'prebuilt');
  }

  /**
   * Get the cache directory path for a specific library configuration
   */
  private getLibraryCacheDir(config: PrebuiltLibraryConfig): string {
    const { platform, buildConfig, version } = config;
    return path.join(this.cacheDir, version, `${platform}-${buildConfig}`);
  }

  /**
   * Get the expected file name for a prebuilt library
   */
  private getLibraryFileName(config: PrebuiltLibraryConfig): string {
    const { platform, buildConfig } = config;
    const extension = platform === 'ios' ? '.xcframework' : platform === 'android' ? '.aar' : '.framework';
    return `valdi-framework-${platform}-${buildConfig}${extension}`;
  }

  /**
   * Get the archive file name for download
   */
  private getArchiveFileName(config: PrebuiltLibraryConfig): string {
    const { platform, buildConfig } = config;
    return `valdi-framework-${platform}-${buildConfig}.tar.gz`;
  }

  /**
   * Check if a prebuilt library is available in the cache
   */
  isLibraryCached(config: PrebuiltLibraryConfig): boolean {
    const libDir = this.getLibraryCacheDir(config);
    const libFileName = this.getLibraryFileName(config);
    const libPath = path.join(libDir, libFileName);
    return fs.existsSync(libPath);
  }

  /**
   * Get the path to a cached library
   */
  getCachedLibraryPath(config: PrebuiltLibraryConfig): string | null {
    if (!this.isLibraryCached(config)) {
      return null;
    }
    const libDir = this.getLibraryCacheDir(config);
    const libFileName = this.getLibraryFileName(config);
    return path.join(libDir, libFileName);
  }

  /**
   * Download a file from a URL
   */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);

      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect without location header'));
            return;
          }
          file.close();
          fs.unlinkSync(destPath);
          this.downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
    });
  }

  /**
   * Calculate SHA256 checksum of a file
   */
  private calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Get the GitHub release URL for a prebuilt library
   */
  private getDownloadUrl(config: PrebuiltLibraryConfig): string {
    const { version } = config;
    const archiveFileName = this.getArchiveFileName(config);
    return `https://github.com/${this.githubRepo}/releases/download/${version}/${archiveFileName}`;
  }

  /**
   * Download and cache a prebuilt library
   */
  async downloadLibrary(config: PrebuiltLibraryConfig): Promise<string> {
    const libDir = this.getLibraryCacheDir(config);
    const libFileName = this.getLibraryFileName(config);
    const libPath = path.join(libDir, libFileName);

    // Check if already cached
    if (this.isLibraryCached(config)) {
      console.log(
        wrapInColor(
          `Using cached prebuilt library: ${libPath}`,
          ANSI_COLORS.GREEN_COLOR
        )
      );
      return libPath;
    }

    console.log(
      wrapInColor(
        `Downloading prebuilt Valdi framework (${config.platform}-${config.buildConfig})...`,
        ANSI_COLORS.YELLOW_COLOR
      )
    );

    // Ensure cache directory exists
    fs.mkdirSync(libDir, { recursive: true });

    // Download to temporary directory
    return await withTempDir(async (tempDir) => {
      const archiveFileName = this.getArchiveFileName(config);
      const archivePath = path.join(tempDir, archiveFileName);
      const downloadUrl = this.getDownloadUrl(config);

      console.log(`Downloading from: ${downloadUrl}`);

      try {
        await this.downloadFile(downloadUrl, archivePath);
      } catch (error) {
        throw new CliError(
          `Failed to download prebuilt library from ${downloadUrl}. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
          `This may be because:\n` +
          `1. The prebuilt library for version ${config.version} hasn't been published yet\n` +
          `2. You're not connected to the internet\n` +
          `3. The GitHub release doesn't exist\n\n` +
          `You can build from source by using the --no-prebuilt flag with valdi bootstrap.`
        );
      }

      console.log('Extracting prebuilt library...');

      // Extract archive to cache directory
      await decompressTo(archivePath, libDir);

      console.log(
        wrapInColor(
          `Prebuilt library cached at: ${libPath}`,
          ANSI_COLORS.GREEN_COLOR
        )
      );

      return libPath;
    });
  }

  /**
   * Get the current Valdi version from package.json
   */
  static getCurrentValdiVersion(): string {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new CliError('Could not find package.json to determine Valdi version');
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || 'v0.1.0';
  }

  /**
   * Clear the entire prebuilt library cache
   */
  clearCache(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
      console.log(wrapInColor('Prebuilt library cache cleared', ANSI_COLORS.GREEN_COLOR));
    }
  }

  /**
   * Clear cache for a specific version
   */
  clearVersionCache(version: string): void {
    const versionDir = path.join(this.cacheDir, version);
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true });
      console.log(wrapInColor(`Cache cleared for version ${version}`, ANSI_COLORS.GREEN_COLOR));
    }
  }
}
