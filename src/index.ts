import got from 'got'
import {isMatch} from 'matcher'
import uriTemplates, {URITemplate} from 'uri-templates'

export interface Event {
    name: string
    date: Date
    data: any
}

export interface RemoteHandler {
    send: (event: Event) => Promise<void>
}

export interface HttpRemoteHandlerOpts {
    url: string
    processors?: EventProcessor[]
    formatter?: Formatter
}

export type Formatter = (event: Event) => string

export function createJsonFormatter(): Formatter {
    return (event: Event) => {
        return JSON.stringify(event)
    }
}

export class HttpRemoteHandler implements RemoteHandler {
    protected url: URITemplate
    protected processors: EventProcessor[]
    protected formatter: Formatter

    public constructor({url, processors, formatter}: HttpRemoteHandlerOpts) {
        this.url = uriTemplates(url)
        this.processors = processors || []
        this.formatter = formatter || createJsonFormatter()
    }

    public async send(event: Event) {
        let internalEvent: Event | void = event

        for (const processor of this.processors) {
            internalEvent = await processor(internalEvent)

            if (!internalEvent) {
                return
            }
        }

        const formatted = this.formatter(internalEvent)
        const type = 'application/json'

        await got(this.url.fill({eventName: event.name}), {method: 'POST', body: formatted, headers: {
            'content-type': type
        }})
    }
}

export type RoutingRules = Array<{
    eventNameMatchs: string | string[]
    handler: RemoteHandler
    multiStrategy?: 'none' | 'replace' | 'skip'
}>

export interface RemoteEventEmitterOpts {
    routing: {
        rules: RoutingRules
        strategy?: 'byRules' | 'first' | 'last'
    }
    processors?: EventProcessor[]
}

export type EventProcessor = (event: Event) => Promise<Event | void> | Event | void

export class RemoteEventEmitter /*HandableEventEmitter*/ {
    protected routing: RemoteEventEmitterOpts['routing']
    protected processors: EventProcessor[]

    public constructor({routing, processors}: RemoteEventEmitterOpts) {
        this.routing = routing
        this.processors = processors || []
    }

    public async emit(eventName: string, eventData: any) {
        let event: Event | void = this.createEvent(eventName, eventData)

        for (const processor of this.processors) {
            event = await processor(event as Event)

            if (!event) {
                return
            }
        }

        await this.dispatchEvent(event)
    }

    protected async dispatchEvent(event: Event) {
        const handlers = this.getHandlersForEvent(event.name)
        await Promise.all(handlers.map(handler => handler.send(event)))
    }

    protected getHandlersForEvent(eventName: string): RemoteHandler[] {
        const matchingRules = this.routing.rules
            .filter(rule => isMatch(eventName, rule.eventNameMatchs))
            //.map(rule => rule.handler)

        if (matchingRules.length === 0) {
            return []
        }

        if (this.routing.strategy === 'first') {
            return [matchingRules[0].handler]
        } else if (this.routing.strategy === 'last') {
            return [matchingRules[matchingRules.length - 1].handler]
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
            }, [] as RoutingRules).map(rule => rule.handler)
        }
    }

    protected createEvent(eventName: string, eventData: any): Event {
        return {
            name: eventName,
            date: new Date,
            data: eventData
        }
    }
}

