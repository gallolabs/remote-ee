<p align="center">
    <img height="200" src="https://raw.githubusercontent.com/gallolabs/remote-ee/main/logo_w200.jpeg">
  <p align="center"><strong>Remote Event Emitter</strong></p>
</p>

Like EventEmitter, but to remote listeners.

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