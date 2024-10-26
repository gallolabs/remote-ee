// Thanks Copilot for the generated test
import { HttpTransport, createEventEmitter, createJsonFormatter } from './index.js'
import nock from 'nock'
import assert from 'assert'
import NanoDate from '@gallolabs/nanodate'

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
        const date = new NanoDate()

        nock('http://example.com')
            .matchHeader('content-type', 'application/json')
            .post('/event/app-foo-bar/notify', JSON.stringify({ date, key2: 'value1', key3: 'value3' }))
            .reply(200)

        const emitter = createEventEmitter({
            preDispatch(event) {
                // assert date is ok
                event.date = date
            },
            listeners: [
                {
                    matchsEventName: 'app.foo.bar',
                    preProcess(event) {
                        return {
                            ...event,
                            name: event.name.replace(/\./g, '-'),
                            data: {
                                ...event.data,
                                key3: 'value3'
                            }
                        }
                    },
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

        assert.strictEqual(true, await emitter.emit('app.foo.bar', { key1: 'value1' }))
        assert.strictEqual(false, await emitter.emit('app.foo.baz', { key1: 'value1' }))

        assert(nock.isDone())
    })

})
