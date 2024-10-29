import { defineEventHandler, getRouterParams, createError } from 'h3'
import { HNResponse, Story, Comment } from '~/types'
import { getCacheHeaders } from '~/utils/cacheHeaders'

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
    }

    const response = new Response(JSON.stringify(story), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120, stale-while-revalidate',
      },
    })

    return response
  } catch (error) {
    console.error('Error fetching story:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch story',
    })
  }
})
