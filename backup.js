const { Readable } = require('stream')
const { Octokit } = require('@octokit/rest')
const aws = require('aws-sdk')

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

    const tasks = repos.map(async ({ name: repo, owner: { login: owner } }) => {
      // download archive
      const archive = await octokit.rest.repos.downloadTarballArchive({
        owner,
        repo
      })

      const stream = Readable.from(Buffer.from(archive.data))

      // upload archive to s3
      const bucketParams = {
        Bucket: options.s3BucketName,
        Key: `${date}/${owner}/${repo}.tar.gz`,
        Body: stream,
        StorageClass: options.s3StorageClass || 'STANDARD',
        ServerSideEncryption: 'AES256'
      }
      return s3.upload(bucketParams).promise().then(() => {
        console.log(`[✓] ${owner}/${repo}.git - backed up`)
      })
    })

    return Promise.all(tasks)
  }

  return getAllRepos().then(copyReposToS3)
}
