import { fetchUserComments } from '../../../utils/userActivity'
import { createUserActivityHandler } from '../../../utils/userActivityHandler'

export default createUserActivityHandler({
  errorLogMessage: 'Error fetching user comments:',
  errorStatusMessage: 'Failed to fetch user comments',
  fetchActivity: fetchUserComments,
  timingDescription: 'Algolia user comments and mapping',
})
