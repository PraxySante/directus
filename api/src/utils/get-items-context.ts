import type { Accountability, PermissionsAction, Query, SchemaOverview, Item, PrimaryKey } from '@directus/types';
import type { Knex } from 'knex';
import { ForbiddenError } from '@directus/errors';
import { ItemsService } from '../services/items.js';

export async function getItemsContext(
	context: {
		accountability: null | Accountability;
		schema: SchemaOverview;
		knex: Knex;
	},
	action: PermissionsAction,
	collection: string,
	pk: PrimaryKey | PrimaryKey[],
	fields: string[] = ['*']
): Promise<Array<Item>> {
	const itemsService = new ItemsService(collection, context);

	if (!Array.isArray(pk)) {
		pk = [pk];
	}

	const query: Query = {
		fields,
		limit: pk.length,
	};

	let result = await itemsService.readMany(pk, query, { permissionsAction: action });

	if (!result || Object.keys(result).length === 0) {
        result = []
    }

	if (result.length > 0 && result.length !== pk.length) throw new ForbiddenError();

	return result;
}