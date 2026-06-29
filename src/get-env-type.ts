export type NextEnvironment = 'dev' | 'build' | 'prod'

export function getNextEnvironment(): NextEnvironment {
  const args = process.argv

  for (const arg of args) {
    switch (arg) {
      case 'dev':
        return 'dev'

      case 'build':
        return 'build'

      case 'start':
        return 'prod'
    }
  }

  // Fallback when running programmatically
  switch (process.env.NODE_ENV) {
    case 'development':
      return 'dev'

    case 'production':
      return 'prod'

    default:
      return 'dev'
  }
}
