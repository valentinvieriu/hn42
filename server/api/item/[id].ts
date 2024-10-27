import { defineEventHandler, getRouterParams, createError } from 'h3'
import { HNResponse, Story, Comment } from '~/types'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) // Retrieve route parameters
  const id = params.id // Extract the id from route parameters

  console.log('Received ID:', id) // Log the received ID
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Story ID is required',
    })
  }

  try {
    const hnResponse: HNResponse = await $fetch(`http://hn.algolia.com/api/v1/items/${id}`)

    if (!hnResponse) {
      throw new Error('No data found')
    }

    const screenshotUrl = `https://backup15.terasp.net/api/screenshot?resX=1080&resY=1600&outFormat=jpg&waitTime=100&isFullPage=true&dismissModals=true&url=${encodeURIComponent(
      hnResponse.url || 'https://news.ycombinator.com'
    )}`

    const story: Story = {
      id: hnResponse.id,
      created_at: hnResponse.created_at,
      author: hnResponse.author,
      title: hnResponse.title || 'Untitled',
      url: hnResponse.url || '',
      text: hnResponse.text,
      points: hnResponse.points || 0,
      parent_id: hnResponse.parent_id,
      children: hnResponse.children || [],
      screenshotUrl,
    }

    return story
  } catch (error) {
    console.error('Error fetching story:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch story',
    })
  }
})
