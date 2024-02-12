import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { FastifyInstance } from 'fastify'
import { redis } from '../../lib/redis'

export async function getPoll(app: FastifyInstance) {
  app.get('/polls/:pollId', async (request, reply) => {
    const createPollParams = z.object({
      pollId: z.string().uuid(),
    })

    const { pollId } = createPollParams.parse(request.params)

    const poll = await prisma.poll.findUnique({
      where: {
        id: pollId,
      },
      include: {
        options: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    if (!poll) {
      return reply.status(404).send({
        message: 'Poll not found.',
      })
    }

    const votesOnRedis = await redis.zrange(pollId, 0, -1, 'WITHSCORES')

    const votes = votesOnRedis.reduce(
      (previousValue, currentValue, currentIndex) => {
        if (currentIndex % 2 === 0) {
          const score = Number(votesOnRedis[currentIndex + 1])

          Object.assign(previousValue, { [currentValue]: score })
        }

        return previousValue
      },
      {} as Record<string, number>,
    )

    return reply.send({
      poll: {
        id: poll.id,
        title: poll.title,
        options: poll.options.map(({ id, title }) => {
          return {
            id,
            title,
            score: id in votes ? votes[id] : 0,
          }
        }),
      },
    })
  })
}
