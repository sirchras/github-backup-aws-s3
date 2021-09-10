const { Octokit } = require('@octokit/rest')
const stream = require('stream')
const request = require('superagent')
const aws = require('aws-sdk')
const Promise = require('bluebird')

const requiredOptions = [
  'githubAccessToken',
  's3BucketName',
  's3AccessKeyId',
  's3AccessSecretKey'
]

module.exports = function (options) {
  requiredOptions.forEach(key => {
    if (!options[key]) {
      console.error('missing option `' + key + '`')
      process.exit(1)
    }
  })

  const octokit = new Octokit({
    auth: options.githubAccessToken,
    userAgent: 'github-backup-aws-s3 v1.2.0'
  })

  function getAllRepos () {
    if (options.mode === 'organisation') {
      console.log('Running in Organisation mode')
      return octokit.paginate(octokit.rest.repos.listForOrg, {
        org: options.organisation,
        type: 'all'
      })
    } else {
      console.log('Running in User mode')
      return octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
        affiliation: 'owner'
      })
    }
  }

  function copyReposToS3 (repos) {
    console.log('Found ' + repos.length + ' repos to backup')
    console.log('-------------------------------------------------')

    const date = new Date().toISOString()
    const s3 = new aws.S3({
      accessKeyId: options.s3AccessKeyId,
      secretAccessKey: options.s3AccessSecretKey
    })

    const uploader = Promise.promisify(s3.upload.bind(s3))
    const tasks = repos.map(repo => {
      const passThroughStream = new stream.PassThrough()
      // const archiveURL =
      //   'https://api.github.com/repos/' +
      //   repo.full_name +
      //   '/tarball/master?access_token=' +
      //   options.githubAccessToken

      const archiveURL = octokit.rest.repos.downloadTarballArchive({
        owner: repo.owner.login,
        repo: repo.name
      })

      // const requestOptions = {
      //   url: archiveURL,
      //   headers: {
      //     'User-Agent': 'nodejs'
      //   }
      // }

      const req = request.get(archiveURL)
        .set('User-Agent', 'nodejs')

      // request(requestOptions).pipe(passThroughStream)
      req.pipe(passThroughStream)

      const bucketName = options.s3BucketName
      const objectName = date + '/' + repo.full_name + '.tar.gz'
      const params = {
        Bucket: bucketName,
        Key: objectName,
        Body: passThroughStream,
        StorageClass: options.s3StorageClass || 'STANDARD',
        ServerSideEncryption: 'AES256'
      }

      return uploader(params).then(() => {
        console.log('[✓] ' + repo.full_name + '.git - backed up')
      })
    })

    return Promise.all(tasks)
  }

  return getAllRepos().then(copyReposToS3)
}
