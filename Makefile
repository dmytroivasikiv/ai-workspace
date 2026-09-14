.PHONY: setup demo check test

setup:
	./bin/aiw setup

demo:
	./bin/aiw demo

check:
	./bin/aiw ci-check

test:
	npm --prefix demo-projects/shop/api test
	npm --prefix demo-projects/shop/web test
	npm --prefix demo-projects/support/bot test
