import * as core from '@actions/core'
import * as github from '@actions/github'
import {EventPayloads} from '@octokit/webhooks'
import {IncomingWebhook, IncomingWebhookResult} from '@slack/webhook'
import {SendDTO} from './sendDTO'

function jobColor(status: string): string | undefined {
  if (status.toLowerCase() === 'success') return 'good'
  if (status.toLowerCase() === 'failure') return 'danger'
  if (status.toLowerCase() === 'cancelled') return 'warning'
}

function stepIcon(status: string): string {
  if (status.toLowerCase() === 'success') return ':white_check_mark:'
  if (status.toLowerCase() === 'failure') return ':x:'
  if (status.toLowerCase() === 'cancelled') return ':exclamation:'
  if (status.toLowerCase() === 'skipped') return ':no_entry_sign:'
  return `:grey_question: ${status}`
}

function isStepError(status: string): boolean {
  return status.toLowerCase() === 'failure' || status.toLowerCase() === 'cancelled'
}

async function send({
  url,
  jobText,
  jobName,
  jobStatus,
  jobSteps,
  channel,
  jobNotifyChannelOnFail
}: SendDTO): Promise<IncomingWebhookResult> {
  const eventName = process.env.GITHUB_EVENT_NAME
  const workflow = process.env.GITHUB_WORKFLOW
  const repositoryName = process.env.GITHUB_REPOSITORY
  const repositoryUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`

  const runId = process.env.GITHUB_RUN_ID
  const runNumber = process.env.GITHUB_RUN_NUMBER
  // const workflowUrl = `${repositoryUrl}/actions/runs/${runId}`

  const sha = process.env.GITHUB_SHA as string
  const shortSha = sha.slice(0, 8)
  // const branch = process.env.GITHUB_HEAD_REF || (process.env.GITHUB_REF?.replace('refs/heads/', '') as string)
  const actor = process.env.GITHUB_ACTOR

  let payload,
    action,
    // ref = branch,
    // refUrl = `${repositoryUrl}/commits/${branch}`,
    // diffRef = shortSha,
    // diffUrl = `${repositoryUrl}/commit/${shortSha}`,
    // title,
    sender
  const ts = Math.round(new Date().getTime() / 1000)

  switch (eventName) {
    case 'issues':
      payload = github.context.payload as EventPayloads.WebhookPayloadIssues
    // falls through
    case 'issue_comment': {
      payload = github.context.payload as EventPayloads.WebhookPayloadIssueComment
      action = payload.action
      // ref = `#${payload.issue.number}`
      // refUrl = payload.issue.html_url
      // diffUrl = payload.issue.comments_url
      // title = payload.issue.title
      sender = payload.sender
      // ts = new Date(payload.issue.updated_at).getTime() / 1000
      break
    }
    case 'pull_request': {
      payload = github.context.payload as EventPayloads.WebhookPayloadPullRequest
      action = payload.action
      // ref = `#${payload.number}`
      // refUrl = payload.pull_request.html_url
      // diffUrl = `${payload.pull_request.html_url}/files`
      // diffRef = payload.pull_request.head.ref
      // title = payload.pull_request.title
      sender = payload.sender
      // ts = new Date(payload.pull_request.updated_at).getTime() / 1000
      break
    }
    case 'push': {
      payload = github.context.payload as EventPayloads.WebhookPayloadPush
      action = null
      // ref = payload.ref.replace('refs/heads/', '')
      // diffUrl = payload.compare
      // title = `${payload.commits.length} commits`
      sender = payload.sender
      // ts = new Date(payload.commits[0].timestamp).getTime() / 1000
      break
    }
    case 'schedule':
      action = null
      // ref = (process.env.GITHUB_REF as string).replace('refs/heads/', '')
      // title = `Schedule \`${github.context.payload.schedule}\``
      sender = {
        login: 'github',
        html_url: 'https://github.com/github',
        avatar_url: 'https://avatars1.githubusercontent.com/u/9919?s=200&v=4'
      }
      break
    case 'workflow_dispatch':
      payload = github.context.payload as EventPayloads.WebhookPayloadWorkflowDispatch
      // ref = payload.ref.replace('refs/heads/', '')
      sender = payload.sender
      break
    default: {
      core.info('Unsupported webhook event type. Using environment variables.')
      action = process.env.GITHUB_ACTION?.startsWith('self') ? '' : process.env.GITHUB_ACTION
      // ref = (process.env.GITHUB_REF as string).replace('refs/heads/', '')
      sender = {
        login: actor,
        html_url: `https://github.com/${actor}`,
        avatar_url: ''
      }
    }
  }

  // add job steps, if provided
  const checks: string[] = []
  let shouldNotifyChannel = false
  for (const [step, status] of Object.entries(jobSteps)) {
    checks.push(`${stepIcon(status.outcome)} ${step}`)
    shouldNotifyChannel = isStepError(status.outcome)
  }

  const text = `${jobText}${jobNotifyChannelOnFail && shouldNotifyChannel ? ' <!here>' : ''}`
  const fields = [
    {
      title: 'Action/Job',
      value: `<https://github.com/${repositoryName}/commit/${sha}/checks | ${workflow}> -> ${jobName}`,
      short: true
    },
    {
      title: 'Status',
      value: jobStatus,
      short: true
    },
    {
      title: 'Commit',
      value: `<https://github.com/${repositoryName}/commit/${sha} | ${shortSha}>`,
      short: true
    },
    {
      title: 'Event',
      value: `${eventName}`,
      short: true
    }
  ]
  if (checks.length) {
    fields.push({
      title: 'Job Steps',
      value: checks.join('\n'),
      short: false
    })
  }

  const message = {
    username: 'GitHub Action',
    icon_url: 'https://octodex.github.com/images/original.png',
    channel,
    attachments: [
      {
        fallback: `[GitHub]: [${repositoryName}] ${workflow} ${eventName} ${action ? `${action} ` : ''}${jobStatus}`,
        color: jobColor(jobStatus),
        author_name: sender?.login,
        author_link: sender?.html_url,
        author_icon: sender?.avatar_url,
        mrkdwn_in: ['text' as const],
        text,
        fields,
        footer: `<${repositoryUrl}/actions/runs/${runId}|${repositoryName}> #${runNumber}`,
        footer_icon: 'https://github.githubassets.com/favicon.ico',
        ts: ts.toString()
      }
    ]
  }
  core.debug(JSON.stringify(message, null, 2))

  const webhook = new IncomingWebhook(url)
  return await webhook.send(message)
}

export default send
