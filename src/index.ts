import got, {Method} from 'got'
import {isMatch} from 'matcher'
import uriTemplates, {URITemplate} from 'uri-templates'
import {cloneDeep} from 'lodash-es'
import NanoDate from '@gallolabs/nanodate'

export interface Event {
    name: string
    date: NanoDate
    uid: string
    data: any
}

export type EventHook = (event: Event) => Promise<Event | null | undefined> | null | void | Event

export type DispatchStrategy = 'firstMatch' | 'lastMatch' | 'multi'

export interface Transport {
    send(formattedEvent: FormattedEvent, event: Event): Promise<void>
}

export interface FormattedEvent {
    contentType: string
    content: string
}

export function createJsonFormatter(): Formatter {
    return (data: any) => {
        return {
            contentType: 'application/json',
            content: JSON.stringify(data)
        }
    }
}

interface ErrorDetails {
    event?: Event
    listener?: Listener
}

export class EmitError extends Error {
    name = 'EmitError'
    event?: Event
    listener?: Listener
    constructor(message: string, options: ErrorOptions & ErrorDetails) {
        super(message, {cause: options.cause})
        this.event = options.event
        this.listener = options.listener
    }
}

export type ErrorHandler = (error: EmitError) => void | Promise<void>

export type Transformer = (event: Event) => Promise<any> | any

export type Formatter = (data: any) => Promise<FormattedEvent> | FormattedEvent

export interface Listener {
    // matcher interface to allow add match logic ? Note can be done in preProccessHook
    matchsEventName: string | string[]
    multiStrategy?: 'none' | 'replace' | 'skip'
    preProcess?: EventHook | EventHook[]
    transport: Transport
    // format: { transform, stringifier }
    transform?: Transformer
    formatter: Formatter
}

export interface EventEmitterOpts {
    preDispatch?: EventHook | EventHook[]
    dispatchStrategy?: DispatchStrategy
    listeners: Listener[]
    uidGenerator?: () => string
    onError?: ErrorHandler
}

export function createEventEmitter(opts: EventEmitterOpts) {
    return new RemoteEventEmitter(opts)
}

class RemoteEventEmitter {
    protected preDispatch?: EventHook | EventHook[]
    protected dispatchStrategy: DispatchStrategy
    protected listeners: Listener[]
    protected uidGenerator: () => string
    protected onError?: ErrorHandler

    constructor(opts: EventEmitterOpts) {
        this.preDispatch = opts.preDispatch
        this.dispatchStrategy = opts.dispatchStrategy || 'multi'
        this.listeners = opts.listeners
        this.uidGenerator = opts.uidGenerator || (() => Math.random().toString(36).substring(2))
        this.onError = opts.onError
    }

    /**
     * @return if the event has been delivered to some listeners (add more precise output ?)
     */
    public async emit(eventName: string, eventData: any): Promise<boolean> {
        let event
        try {
            event = this.createEvent(eventName, eventData)
        } catch (error) {
            this.handleError(error as Error, {})
            return false
        }
        try {
            const postHooksEvent = await this.applyHooks(this.preDispatch, event)

            if (!postHooksEvent) {
                return false
            }

            event = postHooksEvent
        } catch (error) {
            this.handleError(error as Error, {
                event
            })
            return false
        }

        const matchingRules = this.filterMatchingListenersForEvent(event)

        return (
            await Promise.all(
                matchingRules
                .map(listener =>
                    this.emitEventOnListener(listener, cloneDeep(event))
                    .catch((error) => {
                        this.handleError(error as Error, {
                            event,
                            listener
                        })
                        return false
                    })
                )
            )
        ).some(v => v)
    }

    /**
     * @todo
     */
    public async waitForIdle() {
    }

    protected async handleError(error: Error, details: ErrorDetails) {
        let msg = 'Error while logging'
        if (details.listener) {
            msg += ' on listener ' + JSON.stringify(details.listener)
        }
        msg += ' : ' + error.message
        const loggingError = new EmitError(msg, {cause: error, ...details})
        if (!this.onError) {
            //process.nextTick(() => {
                throw loggingError
            //})
            return
        }
        this.onError(loggingError)
    }

    // Not sure the real added value for hooks, a simple fn can make the job
    // fn[] is good to add fns like plugins, but wait ... I don't need it for now !
    protected async applyHooks(hooks: void | EventHook | EventHook[], event: Event): Promise<Event | void> {
        if (!hooks) {
            return event
        }

        hooks = Array.isArray(hooks) ? hooks : [hooks]

        for (const hook of hooks) {
            const afterHookEvent = await hook(event)

            if (afterHookEvent === null) {
                return
            }

            if (afterHookEvent) {
                event = afterHookEvent
            }
        }

        return event
    }

    protected async emitEventOnListener(rule: Listener, event: Event): Promise<boolean> {
        const postHooksEvent = await this.applyHooks(rule.preProcess, event)

        if (!postHooksEvent) {
            return false
        }

        event = postHooksEvent

        const transformed = rule.transform ? await rule.transform(event) : event

        const formatted = await rule.formatter(transformed)

        await rule.transport.send(formatted, event)

        return true
    }

    protected filterMatchingListenersForEvent(event: Event): Listener[] {
        const matchingRules = this.listeners
            .filter(rule => isMatch(event.name, rule.matchsEventName))

        if (matchingRules.length === 0) {
            return []
        }

        if (this.dispatchStrategy === 'firstMatch') {
            return [matchingRules[0]]
        } else if (this.dispatchStrategy === 'lastMatch') {
            return [matchingRules[matchingRules.length - 1]]
        } else {
            return matchingRules.reduce((filteredMatchingRules, rule) => {
                if (filteredMatchingRules.length === 0) {
                    filteredMatchingRules.push(rule)
                } else {
                    if (rule.multiStrategy === 'replace') {
                        filteredMatchingRules = [rule]
                    } else if (rule.multiStrategy === 'skip') {
                        // do nothing
                    } else {
                        filteredMatchingRules.push(rule)
                    }
                }

                return filteredMatchingRules
            }, [] as Listener[])
        }
    }

    protected createEvent(eventName: string, eventData: any): Event {
        return {
            name: eventName,
            date: new NanoDate,
            uid: this.uidGenerator(),
            data: eventData
        }
    }
}

export interface HttpTransportOpts {
    url: string
    method: Method
}

export class HttpTransport implements Transport {
    protected url: URITemplate
    protected method: Method

    public constructor({url, method}: HttpTransportOpts) {
        this.url = uriTemplates(url)
        this.method = method
    }

    public async send(formattedEvent: FormattedEvent, event: Event) {
        await got(
            this.url.fill({eventName: event.name}),
            {
                method: this.method,
                body: formattedEvent.content,
                headers: {
                    'content-type': formattedEvent.contentType
                }
            }
        )
    }
}

