// Thanks Copilot for the generated test
import { HttpRemoteHandler, RemoteEventEmitter, Event } from './index.js'
import nock from 'nock'

describe('RemoteEventEmitter', () => {
    it('#emit', async () => {
        const date = new Date()
        const url = 'http://example.com/event/{eventName}/notify'
        const event: Event = { name: 'testEvent', date, data: { key: 'value' } }

        nock('http://example.com')
            .post('/event/testEvent/notify', JSON.stringify(event))
            .reply(200)

        const handler = new HttpRemoteHandler({ url })
        const emitter = new RemoteEventEmitter({
            processors: [(event) => {
                // assert date is ok
                event.date = date
                return event
            }],
            routing: {
                rules: [{ eventNameMatchs: 'testEvent', handler }]
            }
        })

        await emitter.emit('testEvent', { key: 'value' })
    })

})
