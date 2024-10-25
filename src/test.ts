// Thanks Copilot for the generated test
import { HttpTransport, createEventEmitter, createJsonFormatter } from './index.js'
import nock from 'nock'
import assert from 'assert'

describe('RemoteEventEmitter', () => {
    afterEach(() => {
        nock.cleanAll()
    })
    before(() => {
        if (!nock.isActive()) {
            nock.activate()
        }
    })
    after(() => {
        nock.restore()
    })
    it('#emit', async () => {
        const date = new Date()

        nock('http://example.com')
            .matchHeader('content-type', 'application/json')
            .post('/event/testEvent/notify', JSON.stringify({ date, key2: 'value1', key3: 'value3' }))
            .reply(200)

        const emitter = createEventEmitter({
            preDispatchHooks: [(event) => {
                // assert date is ok
                event.date = date
            }],
            dispatchRules: [
                {
                    matchsEvent: 'testEvent',
                    preProcessHooks: [(event) => {
                        event.data.key3 = 'value3'
                    }],
                    transport: new HttpTransport({
                        url: 'http://example.com/event/{eventName}/notify',
                        method: 'POST'
                    }),
                    transform: (event) => ({
                        date: event.date,
                        key2: event.data.key1,
                        key3: event.data.key3
                    }),
                    formatter: createJsonFormatter()
                }
            ]
        })

        await emitter.emit('testEvent', { key1: 'value1' })

        assert(nock.isDone())
    })

})
