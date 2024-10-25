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

export type EventHook = (event: Event) => Promise<Event | null | undefined> | null | void

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

export type Transformer = (event: Event) => Promise<any> | any

export type Formatter = (data: any) => Promise<FormattedEvent> | FormattedEvent

export interface DispatchRule {
    // matcher interface to allow add match logic ? Note can be done in preProccessHook
    matchsEvent: string | string[]
    multiStrategy?: 'none' | 'replace' | 'skip'
    preProcessHooks?: EventHook[]
    transport: Transport
    transform?: Transformer
    formatter: Formatter
}

export interface EventEmitterOpts {
    preDispatchHooks?: EventHook[]
    dispatchStrategy?: DispatchStrategy
    dispatchRules: DispatchRule[]
    uidGenerator?: () => string
}

export function createEventEmitter(opts: EventEmitterOpts) {
    return new RemoteEventEmitter(opts)
}

class RemoteEventEmitter {
    protected preDispatchHooks: EventHook[]
    protected dispatchStrategy: DispatchStrategy
    protected dispatchRules: DispatchRule[]
    protected uidGenerator: () => string

    constructor(opts: EventEmitterOpts) {
        this.preDispatchHooks = opts.preDispatchHooks || []
        this.dispatchStrategy = opts.dispatchStrategy || 'multi'
        this.dispatchRules = opts.dispatchRules
        this.uidGenerator = opts.uidGenerator || (() => Math.random().toString(36).substring(2))
    }

    public async emit(eventName: string, eventData: any) {
        let event = this.createEvent(eventName, eventData)

        for (const hook of this.preDispatchHooks) {
            const afterHookEvent = await hook(event)

            if (afterHookEvent === null) {
                return
            }

            if (afterHookEvent) {
                event = afterHookEvent
            }
        }

        await this.dispatchEvent(event)
    }

    protected async dispatchEvent(event: Event) {
        const matchingRules = this.filterMatchingRulesForEvent(event)

        await Promise.all(matchingRules.map(rule => this.dispatchEventOnRule(rule, cloneDeep(event))))
    }

    protected async dispatchEventOnRule(rule: DispatchRule, event: Event) {
        for (const hook of (rule.preProcessHooks || [])) {
            const afterHookEvent = await hook(event)

            if (afterHookEvent === null) {
                return
            }

            if (afterHookEvent) {
                event = afterHookEvent
            }
        }

        const transformed = rule.transform ? await rule.transform(event) : event

        const formatted = await rule.formatter(transformed)

        await rule.transport.send(formatted, event)
    }

    protected filterMatchingRulesForEvent(event: Event): DispatchRule[] {
        const matchingRules = this.dispatchRules
            .filter(rule => isMatch(event.name, rule.matchsEvent))

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
            }, [] as DispatchRule[])
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

