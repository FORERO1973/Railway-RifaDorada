import { createFlow } from '@builderbot/bot'
import { welcomeFlow } from './welcome.flow'
import { menuFlow } from './menu.flow'
import { numbersFlow } from './numbers.flow'
import { receiptFlow } from './receipt.flow'

export const flow = createFlow([receiptFlow, welcomeFlow, menuFlow, numbersFlow])
