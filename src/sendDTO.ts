export interface SendDTO {
  url: string
  jobText: string
  jobName: string
  jobStatus: string
  jobSteps: object
  channel: string
  jobNotifyChannelOnFail: boolean
}
