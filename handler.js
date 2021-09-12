const aws = require('aws-sdk')
const backup = require("./backup")

require("dotenv").config()

module.exports.runBackup = (event, context, callback) => {
  const ssm = new aws.SSM()
  const param = {
    Name: 'GITHUB_PAT',
    WithDecryption: true
  }

  ssm.getParameter(param).promise()
    .then(res => {
      const { Parameter: { Value: githubAccessToken } } = res

      return {
        githubAccessToken,
        s3BucketName: process.env.AWS_S3_BUCKET_NAME,
        s3AccessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
        s3AccessSecretKey: process.env.AWS_S3_ACCESS_SECRET_KEY,
        s3StorageClass: process.env.AWS_S3_STORAGE_CLASS,
        mode: process.env.BACKUP_MODE,
        organisation: process.env.GITHUB_ORGANISATION
      }
    })
    .then(options => backup(options))
    .then(() => {
      callback(null, {
        response: "all repos were successfully backed up"
      })
    })
}
