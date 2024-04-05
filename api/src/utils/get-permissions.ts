import { useEnv } from '@directus/env';
import type { Accountability, Permission, SchemaOverview } from '@directus/types';
import { parseFilter, parsePreset } from '@directus/utils';
import hash from 'object-hash';
import { getCache, getCacheValue, getSystemCache, setCacheValue, setSystemCache } from '../cache.js';
import getDatabase from '../database/index.js';
import { appAccessMinimalPermissions } from '@directus/system-data';
import { useLogger } from '../logger.js';
import { mergePermissionsForShare } from './merge-permissions-for-share.js';
import { mergePermissions } from './merge-permissions.js';
import { parsePermissions } from './parse-permission.js';
import { getFilterContext } from './get-filter-context.js';

export async function getPermissions(accountability: Accountability, schema: SchemaOverview) {
	const database = getDatabase();
	const { cache } = getCache();
	const env = useEnv();
	const logger = useLogger();

	let permissions: Permission[] = [];

	const { user, role, app, admin, share_scope } = accountability;
	const cacheKey = `permissions-${hash({ user, role, app, admin, share_scope })}`;

	if (cache && env['CACHE_PERMISSIONS'] !== false) {
		let cachedPermissions;

		try {
			cachedPermissions = await getSystemCache(cacheKey);
		} catch (err: any) {
			logger.warn(err, `[cache] Couldn't read key ${cacheKey}. ${err.message}`);
		}

		if (cachedPermissions) {
			if (!cachedPermissions['containDynamicData']) {
				return processPermissions(accountability, cachedPermissions['permissions'], {});
			}

			const cachedFilterContext = await getCacheValue(
				cache,
				`filterContext-${hash({ user, role, permissions: cachedPermissions['permissions'] })}`,
			);

			if (cachedFilterContext) {
				return processPermissions(accountability, cachedPermissions['permissions'], cachedFilterContext);
			} else {
				const {
					permissions: parsedPermissions,
					requiredPermissionData,
					containDynamicData,
				} = parsePermissions(cachedPermissions['permissions']);

				permissions = parsedPermissions;

				const filterContext = containDynamicData
					? await getFilterContext(schema, accountability, requiredPermissionData)
					: {};

				if (containDynamicData && env['CACHE_ENABLED'] !== false) {
					await setCacheValue(cache, `filterContext-${hash({ user, role, permissions })}`, filterContext);
				}

				return processPermissions(accountability, permissions, filterContext);
			}
		}
	}

	if (accountability.admin !== true) {
		const query = database.select('*').from('directus_permissions');

		if (accountability.role) {
			query.where({ role: accountability.role });
		} else {
			query.whereNull('role');
		}

		const permissionsForRole = await query;

		const {
			permissions: parsedPermissions,
			requiredPermissionData,
			containDynamicData,
		} = parsePermissions(permissionsForRole);

		permissions = parsedPermissions;

		if (accountability.app === true) {
			permissions = mergePermissions(
				'or',
				permissions,
				appAccessMinimalPermissions.map((perm: any) => ({ ...perm, role: accountability.role })),
			);
		}

		if (accountability.share_scope) {
			permissions = mergePermissionsForShare(permissions, accountability, schema);
		}

		const filterContext = containDynamicData
			? await getFilterContext(schema, accountability, requiredPermissionData)
			: {};

		if (cache && env['CACHE_PERMISSIONS'] !== false) {
			await setSystemCache(cacheKey, { permissions, containDynamicData });

			if (containDynamicData && env['CACHE_ENABLED'] !== false) {
				await setCacheValue(cache, `filterContext-${hash({ user, role, permissions })}`, filterContext);
			}
		}

		return processPermissions(accountability, permissions, filterContext);
	}

	return permissions;
}

function processPermissions(
	accountability: Accountability,
	permissions: Permission[],
	filterContext: Record<string, any>,
) {
	return permissions.map((permission) => {
		permission.permissions = parseFilter(permission.permissions, accountability!, filterContext);
		permission.validation = parseFilter(permission.validation, accountability!, filterContext);
		permission.presets = parsePreset(permission.presets, accountability!, filterContext);

		return permission;
	});
}
