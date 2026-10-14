export type Platform = 'macos' | 'linux' | 'windows'

export function isWindows(osVariable: string | undefined): boolean {
  return osVariable === 'Windows_NT'
}

export function detectPlatform(osVariable: string | undefined, kernelName: string | null): Platform {
  if (isWindows(osVariable)) return 'windows'
  return kernelName === 'Darwin' ? 'macos' : 'linux'
}

export function openUrlArgv(platform: Platform, url: string): string[] {
  switch (platform) {
    case 'macos':
      return ['open', url]
    case 'linux':
      return ['xdg-open', url]
    case 'windows':
      return ['rundll32', 'url.dll,FileProtocolHandler', url]
  }
}
