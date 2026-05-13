import { createFlow } from '@builderbot/bot'
import { welcomeFlow } from './welcome.flow'
import { menuFlow } from './menu.flow'
import { numbersFlow } from './numbers.flow'

export const flow = createFlow([welcomeFlow, menuFlow, numbersFlow])
