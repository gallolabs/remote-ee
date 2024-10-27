<p align="center">
    <img height="200" src="https://raw.githubusercontent.com/gallolabs/remote-ee/main/logo_w200.jpeg">
  <p align="center"><strong>Remote Event Emitter</strong></p>
</p>

Like EventEmitter, but to remote listeners.

Like logger.log(), remoteEE.emit() is async and as caller user you can wait for the job to be done (await), but no error will be thrown where called. This is by design as you want to emit an event without matter of what happens behind (we can add an option for that ?). As app user, you want to know when it fails, and so a onError() callback is available. But, you can omit onError() and catch on calling, but the behavior is undetermined.

```typescript
import {createEventEmitter, HttpTransport, createJsonFormatter} from '@gallolabs/remote-ee'

// Example of central events dispatch delegation
const remoteEE = createEventEmitter({
    listeners: [{
        matchsEventName: '*',
        transport: new HttpTransport({
            url: 'http://event-handler/handle',
            method: 'POST'
        }),
        formatter: createJsonFormatter()
    }]
})

remoteEE.emit('app.something.done', { thing: 'foo', time: 3788 })

// Example of configured listeners
const remoteEE = createEventEmitter({
    listeners: [
        {
            matchsEventName: ['app.something.*', '!app.something.pending'],
            transport: new HttpTransport({
                url: 'http://status-service/handle/{eventName}',
                method: 'POST'
            }),
            transform: event => ({
                date: event.date,
                ...event.data
            }),
            formatter: createJsonFormatter()
        },
        {
            ...
        }
    ],
    onError() {...}
})

```

TODO:
- Implement waitForIdle
- Add hook support ?
- Add ability to switch error handling in call or global (hook vs event)
- Url replacement with any var of event ? ex: {data.value1} or {data.name}
- move transform and formatter into format section ? because it's format, where transform is transform data and formatter is stringify